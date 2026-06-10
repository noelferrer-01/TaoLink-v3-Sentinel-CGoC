/**
 * Recruitment service — applicant pipeline, document checklist, blacklist, and
 * the hire handoff to HR. Every mutation records an audit row and publishes an
 * event, mirroring modules/hr and modules/assignments.
 */

import { and, desc, eq, ilike, sql, inArray, ne, notInArray, getTableColumns } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/core/db';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { hr } from '@/modules/hr';
import { employees } from '@/modules/hr/schema';
import {
  applicants,
  applicantDocuments,
  blacklist,
  type Applicant,
  type ApplicantDocument,
  type BlacklistEntry,
} from './schema';
import { ALLOWED_TRANSITIONS, requiredDocsFor, type DocType, type DocStatus, type Stage, type MatchKind } from './labels';
import {
  createPerson, assertAnchored, getPerson, findPersonByAnyId, findPossibleDuplicates,
  persons, type Person, ID_TYPE_LADDER,
  personFullNameMatches, personFullNameSimilarityDesc, withNameSearchThreshold,
} from '@/modules/persons';

// ─── ApplicantIdentity ────────────────────────────────────────────────────────
// getApplicant returns this shape: the applicant role row plus the linked
// Person's identity fields (same property names the legacy applicant columns
// had, so callers keep their field names). Since 0024 the applicant row carries
// NO identity — the Person is the only source. firstName/lastName are
// non-nullable because persons.first_name/last_name are NOT NULL and the
// applicant→person FK is NOT NULL + RESTRICT.

export type ApplicantIdentity = {
  firstName:   Person['firstName'];
  lastName:    Person['lastName'];
  middleName:  Person['middleName'];
  dateOfBirth: Person['dateOfBirth'];
  sssNumber:   Person['sssNumber'];
  // Anchor identity — the recruiter may have anchored on any ID type in the
  // ladder, not just SSS. anchorIdType is the canonical anchor ('none' =
  // provisional); the ID numbers let the detail page show whichever is on file
  // (incl. secondary anchors: passport / UMID / driver's license).
  anchorIdType:  Person['anchorIdType'];
  philsysNumber: Person['philsysNumber'];
  tinNumber:     Person['tinNumber'];
  passportNumber:       Person['passportNumber'];
  umidNumber:           Person['umidNumber'];
  driversLicenseNumber: Person['driversLicenseNumber'];
  phone:       Person['phone'];
  email:       Person['email'];
  addressLine1: Person['addressLine1'];
  addressLine2: Person['addressLine2'];
  city:        Person['city'];
  province:    Person['province'];
};

// ─── createApplicant ───────────────────────────────────────────────────────────

export type CreateApplicantInput = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  dateOfBirth?: string | null;
  sssNumber?: string | null;
  philsysNumber?: string | null;
  tinNumber?: string | null;
  passportNumber?: string | null;
  umidNumber?: string | null;
  driversLicenseNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  source: Applicant['source'];
  positionAppliedFor?: Applicant['positionAppliedFor'];
  isArmedPost?: boolean;
  appliedOn: string;
  notes?: string | null;
  actorUserId?: string | null;
};

export async function createApplicant(input: CreateApplicantInput): Promise<Applicant> {
  const db = getDb();

  // ── Mint a Person from the applicant's identity; the applicant is a role row ──
  // Person INSERT + applicant INSERT are wrapped in a single transaction so a
  // failed applicant insert (e.g. any constraint violation) rolls back the newly
  // minted Person — no orphaned Person rows. Audit/events run after commit.
  // Identity input fields exist ONLY to feed createPerson — since 0024 the
  // applicant row has no identity columns.
  // Pick the anchor by the ID ladder (philsys > sss > tin > passport > umid > dl):
  // the first provided ID wins. No ID → 'none' (provisional intake is allowed;
  // the hard requirement is at hire, via assertAnchored).
  const idByType: Record<typeof ID_TYPE_LADDER[number], string | null | undefined> = {
    philsys:         input.philsysNumber,
    sss:             input.sssNumber,
    tin:             input.tinNumber,
    passport:        input.passportNumber,
    umid:            input.umidNumber,
    drivers_license: input.driversLicenseNumber,
  };
  const anchorIdType: typeof ID_TYPE_LADDER[number] | 'none' =
    ID_TYPE_LADDER.find((t) => idByType[t]?.trim()) ?? 'none';

  let created: Applicant;
  try {
    created = await db.transaction(async (tx) => {
      const person = await createPerson({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        middleName: input.middleName ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        sssNumber: input.sssNumber ?? null,
        philsysNumber: input.philsysNumber ?? null,
        tinNumber: input.tinNumber ?? null,
        passportNumber: input.passportNumber ?? null,
        umidNumber: input.umidNumber ?? null,
        driversLicenseNumber: input.driversLicenseNumber ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        province: input.province ?? null,
        anchorIdType,
        actorUserId: input.actorUserId ?? null,
      }, { tx });

      const [applicant] = await tx
        .insert(applicants)
        .values({
          source: input.source,
          positionAppliedFor: input.positionAppliedFor ?? 'GUARD',
          isArmedPost: input.isArmedPost ?? false,
          appliedOn: input.appliedOn,
          notes: input.notes ?? null,
          personId: person.id,
          // "ID still needed" nudge — true at creation when no anchor ID was
          // captured. Recomputed by advanceStage; never blocks (hire gate does).
          idPending: anchorIdType === 'none',
        })
        .returning();
      if (!applicant) throw new Error('[recruitment/createApplicant] insert returned no row');

      // Seed the required-doc checklist (all pending) — inside the transaction so
      // docs are created atomically with the applicant.
      const docs = requiredDocsFor(applicant.isArmedPost).map((docType) => ({ applicantId: applicant.id, docType }));
      await tx.insert(applicantDocuments).values(docs);

      return applicant;
    });
  } catch (err: any) {
    // Re-surface clean errors from createPerson (e.g. "SSS already on file")
    // and from the applicant insert without wrapping twice.
    if (err.message?.startsWith('[recruitment/') || err.message?.startsWith('[persons/')) throw err;
    throw err;
  }

  // Audit + events run after commit — not inside the transaction.
  // Name comes from the identity input (the role row no longer carries it).
  await audit.record({
    actor: input.actorUserId ?? null,
    action: 'recruitment.applicant.created',
    target: { kind: 'recruitment_applicant', id: created.id },
    payload: { name: `${input.firstName.trim()} ${input.lastName.trim()}` },
  });
  await events.publish('recruitment.applicant.created', { id: created.id });
  return created;
}

// ─── getApplicant ───────────────────────────────────────────────────────────────

export async function getApplicant(
  id: string,
): Promise<{ applicant: Applicant; identity: ApplicantIdentity; documents: ApplicantDocument[] } | null> {
  const db = getDb();
  const [a] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!a) return null;

  // Identity lives on the linked Person. personId is NOT NULL + RESTRICT since
  // 0024, so a missing Person row means the DB is corrupt — fail loudly.
  const [p] = await db.select().from(persons).where(eq(persons.id, a.personId));
  if (!p) {
    throw new Error(`[recruitment/getApplicant] applicant ${id} has no linked person row (FK should make this impossible)`);
  }

  const identity: ApplicantIdentity = {
    firstName:    p.firstName,
    lastName:     p.lastName,
    middleName:   p.middleName,
    dateOfBirth:  p.dateOfBirth,
    sssNumber:    p.sssNumber,
    anchorIdType:  p.anchorIdType,
    philsysNumber: p.philsysNumber,
    tinNumber:     p.tinNumber,
    passportNumber:       p.passportNumber,
    umidNumber:           p.umidNumber,
    driversLicenseNumber: p.driversLicenseNumber,
    phone:        p.phone,
    email:        p.email,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city:         p.city,
    province:     p.province,
  };

  const documents = await db.select().from(applicantDocuments).where(eq(applicantDocuments.applicantId, id));
  return { applicant: a, identity, documents };
}

// ─── listApplicantsPage ───────────────────────────────────────────────────────

/**
 * Applicant role row merged with the linked Person's name — the shape the
 * /recruitment list page renders. INNER JOIN is exact: applicants.person_id is
 * NOT NULL + RESTRICT since 0024.
 */
export type ApplicantListItem = Applicant & {
  firstName: Person['firstName'];
  lastName:  Person['lastName'];
};

export async function listApplicantsPage(opts: {
  query?: string;
  stage?: Stage;
  limit: number;
  offset: number;
}): Promise<{ rows: ApplicantListItem[]; total: number }> {
  const db = getDb();
  const trimmed = (opts.query ?? '').trim();

  // Route the query to ONE predicate, never an OR of both. A query that is all
  // digits (ignoring spaces/dashes) is an SSS lookup; anything else is a name
  // search. The name path uses the GIN trigram index (`persons_fullname_trgm`);
  // OR-ing in a substring SSS match would drag the common name search back into
  // a full-table scan, so SSS substring stays on its own (rare, small) branch.
  const digits = trimmed.replace(/[\s-]/g, '');
  const isSssQuery = trimmed.length > 0 && digits.length >= 4 && /^\d+$/.test(digits);
  const isNameQuery = trimmed.length > 0 && !isSssQuery;

  const stageFilter = opts.stage ? [eq(applicants.pipelineStage, opts.stage)] : [];
  const queryFilter = isSssQuery
    ? [ilike(persons.sssNumber, `%${trimmed}%`)]
    : isNameQuery
      ? [personFullNameMatches(trimmed)]
      : [];
  const allFilters = [...stageFilter, ...queryFilter];
  const where = allFilters.length ? and(...allFilters) : undefined;

  // Name search ranks by trigram similarity (best match first); otherwise newest first.
  const order = isNameQuery
    ? [personFullNameSimilarityDesc(trimmed), desc(applicants.appliedOn)]
    : [desc(applicants.appliedOn)];

  const run = async (runner: DbOrTx) => {
    const [rows, countRows] = await Promise.all([
      runner
        .select({
          ...getTableColumns(applicants),
          firstName: persons.firstName,
          lastName: persons.lastName,
        })
        .from(applicants)
        .innerJoin(persons, eq(applicants.personId, persons.id))
        .where(where)
        .orderBy(...order)
        .limit(opts.limit)
        .offset(opts.offset),
      runner
        .select({ count: sql<number>`count(*)::int` })
        .from(applicants)
        .innerJoin(persons, eq(applicants.personId, persons.id))
        .where(where),
    ]);
    return { rows, total: countRows[0]?.count ?? 0 };
  };

  // The trigram `%` operator honours the per-transaction SET LOCAL threshold —
  // wrap only the name path so rows + count both see the 0.2 threshold.
  return isNameQuery ? withNameSearchThreshold(db, run) : run(db);
}

// ─── advanceStage ───────────────────────────────────────────────────────────────

/**
 * Computes the idPending nudge flag from the linked Person.
 * Returns true when the person has no anchor ID (anchorIdType='none') or when
 * there is no linked Person at all (personId=null). Never throws for a missing
 * person or missing ID — DB errors propagate normally.
 */
async function computeIdPending(personId: string | null): Promise<boolean> {
  if (!personId) return true;
  const db = getDb();
  const [row] = await db.select({ anchorIdType: persons.anchorIdType })
    .from(persons)
    .where(eq(persons.id, personId));
  if (!row) return true;
  return row.anchorIdType === 'none';
}

export async function advanceStage(
  id: string,
  next: Stage,
  opts: { actorUserId?: string | null } = {},
): Promise<Applicant> {
  const db = getDb();
  const [current] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!current) throw new Error('Applicant not found.');
  if (!ALLOWED_TRANSITIONS[current.pipelineStage].includes(next)) {
    throw new Error(`Cannot move an applicant from ${current.pipelineStage} to ${next}.`);
  }

  // T11: recompute idPending from the linked Person.
  // This is a NUDGE — never blocks the stage advance.
  const idPending = await computeIdPending(current.personId ?? null);

  const [updated] = await db
    .update(applicants)
    .set({ pipelineStage: next, idPending, updatedAt: new Date() })
    .where(eq(applicants.id, id))
    .returning();
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'recruitment.applicant.stage_changed',
    target: { kind: 'recruitment_applicant', id },
    payload: { from: current.pipelineStage, to: next, idPending },
  });
  await events.publish('recruitment.applicant.stage_changed', { id, from: current.pipelineStage, to: next });
  return updated!;
}

// ─── setDocument ───────────────────────────────────────────────────────────────

export async function setDocument(
  applicantId: string,
  docType: DocType,
  patch: { status: DocStatus; expiresOn?: string | null; notes?: string | null; verifiedByUserId?: string | null },
): Promise<void> {
  const db = getDb();
  await db
    .update(applicantDocuments)
    .set({
      status: patch.status,
      expiresOn: patch.expiresOn ?? null,
      notes: patch.notes ?? null,
      verifiedByUserId: patch.verifiedByUserId ?? null,
      verifiedOn: patch.status === 'verified' ? new Date().toISOString().slice(0, 10) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(applicantDocuments.applicantId, applicantId), eq(applicantDocuments.docType, docType)));
}

// ─── reject / withdraw (terminal) ───────────────────────────────────────────────

async function endApplicant(
  id: string,
  stage: 'rejected' | 'withdrawn',
  reason: string,
  actorUserId?: string | null,
): Promise<Applicant> {
  const db = getDb();
  const [current] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!current) throw new Error('Applicant not found.');
  if (!ALLOWED_TRANSITIONS[current.pipelineStage].includes(stage)) {
    throw new Error(`Cannot ${stage} an applicant who is already ${current.pipelineStage}.`);
  }
  const [updated] = await db
    .update(applicants)
    .set({ pipelineStage: stage, outcomeReason: reason, updatedAt: new Date() })
    .where(eq(applicants.id, id))
    .returning();
  await audit.record({
    actor: actorUserId ?? null,
    action: `recruitment.applicant.${stage}`,
    target: { kind: 'recruitment_applicant', id },
    payload: { reason },
  });
  await events.publish(`recruitment.applicant.${stage}`, { id, reason });
  return updated!;
}

export const rejectApplicant = (id: string, reason: string, opts: { actorUserId?: string | null } = {}) =>
  endApplicant(id, 'rejected', reason, opts.actorUserId);
export const withdrawApplicant = (id: string, reason: string, opts: { actorUserId?: string | null } = {}) =>
  endApplicant(id, 'withdrawn', reason, opts.actorUserId);

// ─── checkMatches (all-Person matcher) ─────────────────────────────────────────
//
// Canonical spec: wiki/slices/3-identity-and-credentials.md §5c + §9 (round-2)
// "exact across ALL persons (applicants of any stage + employees of any status)
//  + blacklist personId; active employee → 'double-hire', in-flight applicant →
//  'concurrent application'; normalized fuzzy backstop."

// MatchKind now lives in ./labels (client-safe, shared with the intake form);
// re-exported here so existing `import { MatchKind } from './service'` paths hold.
export type { MatchKind } from './labels';

export type Match = { kind: MatchKind; confidence: 'exact' | 'possible'; label: string; refId: string };

/** Terminal stages — an applicant in one of these is NOT "in-flight". */
const TERMINAL_STAGES: Stage[] = ['hired', 'rejected', 'withdrawn'];

/**
 * Checks for matches across ALL persons (employees of any status, applicants of
 * any stage, and the blacklist). Returns the full match array.
 *
 * Input:
 *   personId         — the subject's personId (nullable); used for exact same-
 *                      Person lookup across role rows.
 *   excludeApplicantId — the applicant row being viewed (exclude it from results
 *                        so the subject doesn't match itself).
 *   firstName/lastName/dateOfBirth/sssNumber — identity fields for fuzzy backstop
 *                        and blacklist snapshot matching.
 */
export async function checkMatches(input: {
  personId: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  sssNumber?: string | null;
  philsysNumber?: string | null;
  tinNumber?: string | null;
  excludeApplicantId?: string | null;
}): Promise<Match[]> {
  const db = getDb();
  const matches: Match[] = [];

  // ── Collect all Persons that could be an exact match ─────────────────────
  // Strategy: gather matching personIds via three channels, then load the
  // role rows for each.
  const exactPersonIds = new Set<string>();

  // Channel 1: same personId directly
  if (input.personId) {
    exactPersonIds.add(input.personId);
  }

  // Channel 2: any person sharing a unique gov ID (PhilSys / SSS / TIN). Each is
  // looked up via findPersonByAnyId, which also surfaces quarantined values.
  const govIdLookups: Array<['sss' | 'philsys' | 'tin', string | null | undefined]> = [
    ['sss', input.sssNumber],
    ['philsys', input.philsysNumber],
    ['tin', input.tinNumber],
  ];
  for (const [type, value] of govIdLookups) {
    if (value) {
      const found = await findPersonByAnyId(type, value);
      if (found) exactPersonIds.add(found.id);
    }
  }

  // ── Exact: employees ──────────────────────────────────────────────────────
  if (exactPersonIds.size > 0) {
    const empRows = await db
      .select({
        id: employees.id,
        employeeCode: employees.employeeCode,
        status: employees.status,
        personId: employees.personId,
        // Names for the label come from the Person (sole identity source).
        firstName: persons.firstName,
        lastName: persons.lastName,
      })
      .from(employees)
      .innerJoin(persons, eq(employees.personId, persons.id))
      .where(inArray(employees.personId, [...exactPersonIds]));

    for (const e of empRows) {
      const isActive = e.status !== 'terminated';
      const kind: MatchKind = isActive ? 'active_employee' : 'terminated_employee';
      const statusLabel = isActive
        ? `Currently active as ${e.employeeCode} — may be a double-hire`
        : `${e.lastName}, ${e.firstName} (${e.employeeCode}) — terminated`;
      matches.push({
        kind,
        confidence: 'exact',
        label: statusLabel,
        refId: e.id,
      });
    }
  }

  // ── Exact: applicants (in-flight only, excluding the subject) ────────────
  if (exactPersonIds.size > 0) {
    const appQuery = db
      .select({
        id: applicants.id,
        pipelineStage: applicants.pipelineStage,
        personId: applicants.personId,
        firstName: persons.firstName,
        lastName: persons.lastName,
      })
      .from(applicants)
      .innerJoin(persons, eq(applicants.personId, persons.id))
      .where(
        and(
          inArray(applicants.personId, [...exactPersonIds]),
          // Only in-flight stages count as "concurrent"
          notInArray(applicants.pipelineStage, TERMINAL_STAGES),
          ...(input.excludeApplicantId ? [ne(applicants.id, input.excludeApplicantId)] : []),
        ),
      );
    const appRows = await appQuery;

    for (const a of appRows) {
      matches.push({
        kind: 'concurrent_applicant',
        confidence: 'exact',
        label: `${a.lastName}, ${a.firstName} — also applying (${a.pipelineStage})`,
        refId: a.id,
      });
    }
  }

  // ── Exact: blacklist (by personId OR snapshot SSS) ────────────────────────
  const blRows = await db.select().from(blacklist).where(eq(blacklist.active, true));
  const sameName = (last: string | null) =>
    (last ?? '').trim().toLowerCase() === input.lastName.trim().toLowerCase();

  for (const b of blRows) {
    // Exact via personId
    if (input.personId && b.personId && b.personId === input.personId) {
      matches.push({
        kind: 'blacklist', confidence: 'exact',
        label: `${b.lastName}, ${b.firstName} — ${b.reason}`,
        refId: b.id,
      });
    }
    // Exact via snapshot SSS number
    else if (input.sssNumber && b.sssNumber && b.sssNumber === input.sssNumber) {
      matches.push({
        kind: 'blacklist', confidence: 'exact',
        label: `${b.lastName}, ${b.firstName} — ${b.reason}`,
        refId: b.id,
      });
    }
    // Possible via snapshot DOB + name
    else if (input.dateOfBirth && b.dateOfBirth === input.dateOfBirth && sameName(b.lastName)) {
      matches.push({
        kind: 'blacklist', confidence: 'possible',
        label: `${b.lastName}, ${b.firstName} — ${b.reason}`,
        refId: b.id,
      });
    }
  }

  // ── Fuzzy backstop: normalized name+DOB across all persons ───────────────
  if (input.firstName && input.lastName && input.dateOfBirth) {
    const fuzzyPersons = await findPossibleDuplicates({
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
    });

    for (const fp of fuzzyPersons) {
      // Skip if this person is already covered by exact matches
      if (exactPersonIds.has(fp.id)) continue;
      // Skip if this is the subject's own Person
      if (input.personId && fp.id === input.personId) continue;

      // Find role rows for this fuzzy Person (employees and in-flight applicants).
      // Labels use fp's name — the role rows belong to that same Person.
      const [fuzzyEmps, fuzzyApps] = await Promise.all([
        db.select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          status: employees.status,
        })
          .from(employees)
          .where(eq(employees.personId, fp.id)),
        db.select({
          id: applicants.id,
          pipelineStage: applicants.pipelineStage,
        })
          .from(applicants)
          .where(
            and(
              eq(applicants.personId, fp.id),
              notInArray(applicants.pipelineStage, TERMINAL_STAGES),
              ...(input.excludeApplicantId ? [ne(applicants.id, input.excludeApplicantId)] : []),
            ),
          ),
      ]);

      for (const e of fuzzyEmps) {
        const isActive = e.status !== 'terminated';
        const kind: MatchKind = isActive ? 'active_employee' : 'terminated_employee';
        const statusLabel = isActive
          ? `Currently active as ${e.employeeCode} — may be a double-hire`
          : `${fp.lastName}, ${fp.firstName} (${e.employeeCode}) — terminated`;
        matches.push({ kind, confidence: 'possible', label: statusLabel, refId: e.id });
      }
      for (const a of fuzzyApps) {
        matches.push({
          kind: 'concurrent_applicant', confidence: 'possible',
          label: `${fp.lastName}, ${fp.firstName} — also applying (${a.pipelineStage})`,
          refId: a.id,
        });
      }
    }
  }

  return matches;
}

// ─── blacklist writers ──────────────────────────────────────────────────────────

export async function addToBlacklist(input: {
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  sssNumber?: string | null;
  reason: string;
  sourceEmployeeId?: string | null;
  addedByUserId?: string | null;
}): Promise<BlacklistEntry> {
  const db = getDb();
  const [created] = await db
    .insert(blacklist)
    .values({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      dateOfBirth: input.dateOfBirth ?? null,
      sssNumber: input.sssNumber ?? null,
      reason: input.reason,
      sourceEmployeeId: input.sourceEmployeeId ?? null,
      addedByUserId: input.addedByUserId ?? null,
    })
    .returning();
  if (!created) throw new Error('[recruitment/addToBlacklist] insert returned no row');
  await audit.record({
    actor: input.addedByUserId ?? null,
    action: 'recruitment.blacklist.added',
    target: { kind: 'recruitment_blacklist', id: created.id },
    payload: { reason: input.reason },
  });
  await events.publish('recruitment.blacklist.added', { id: created.id });
  return created;
}

export async function listBlacklist(): Promise<BlacklistEntry[]> {
  return getDb().select().from(blacklist).where(eq(blacklist.active, true)).orderBy(desc(blacklist.createdAt));
}

export async function removeFromBlacklist(id: string, opts: { actorUserId?: string | null } = {}): Promise<void> {
  const db = getDb();
  await db.update(blacklist).set({ active: false, updatedAt: new Date() }).where(eq(blacklist.id, id));
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'recruitment.blacklist.removed',
    target: { kind: 'recruitment_blacklist', id },
    payload: {},
  });
}

// ─── hireApplicant (ADR 0009 handoff) ───────────────────────────────────────────

export type HireMeta = {
  basicSalary: number | string;
  hiredOn: string;
  employeeCode?: string;
  actorUserId?: string | null;
};

export async function hireApplicant(applicantId: string, meta: HireMeta) {
  const db = getDb();
  const [a] = await db.select().from(applicants).where(eq(applicants.id, applicantId));
  if (!a) throw new Error('Applicant not found.');
  if (a.pipelineStage !== 'documents') {
    throw new Error('Only applicants with completed documents can be hired.');
  }

  // ── T11 hard gate: the applicant's Person must have an anchor ID ──────────
  // (personId itself is NOT NULL + RESTRICT since 0024 — the DB guarantees a
  // linked Person exists.) Person with no anchor ID → blocked.
  await assertAnchored(a.personId);

  // Identity for the handoff comes from the Person (sole source since 0024).
  const person = await getPerson(a.personId);
  if (!person) {
    throw new Error(`[recruitment/hireApplicant] applicant ${applicantId} has no linked person row (FK should make this impossible)`);
  }

  const employeeCode = meta.employeeCode ?? (await hr.generateNextEmployeeCode('CG-'));

  // Handoff per ADR 0009: Recruitment.hireApplicant → HR.createEmployee.
  // Pass the applicant's existing personId so the SAME Person is linked to the
  // new employee — no duplicate human is minted at hire time. The name fields
  // are used only for the audit label (createEmployee never touches the Person
  // when personId is supplied).
  const employee = await hr.createEmployee({
    employeeCode,
    firstName: person.firstName,
    lastName: person.lastName,
    basicSalary: meta.basicSalary,
    hiredOn: meta.hiredOn,
    employmentType: a.positionAppliedFor,
    personId: a.personId,
    actorUserId: meta.actorUserId ?? null,
  });

  // Back-link + mark hired (terminal).
  await db
    .update(applicants)
    .set({ pipelineStage: 'hired', hiredEmployeeId: employee.id, updatedAt: new Date() })
    .where(eq(applicants.id, applicantId));

  await audit.record({
    actor: meta.actorUserId ?? null,
    action: 'recruitment.applicant.hired',
    target: { kind: 'recruitment_applicant', id: applicantId },
    payload: { employeeId: employee.id, employeeCode },
  });
  await events.publish('recruitment.applicant.hired', { id: applicantId, employeeId: employee.id });
  return employee;
}
