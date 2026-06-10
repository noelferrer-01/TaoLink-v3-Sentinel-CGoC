/**
 * Persons service — single source of truth for human identity.
 *
 * Public API (all re-exported from persons/index.ts):
 *   createPerson       — create a Person; accepts anchorIdType='none' (provisional)
 *   assertAnchored     — throws if the person has no anchor ID (used at the hire gate)
 *   getPerson          — fetch a Person by id, or null
 *   findPersonByAnyId  — exact match on a column OR in quarantinedIds
 *   findPossibleDuplicates — normalized name+DOB match (collapses PH particles)
 *   updatePerson       — the ONLY identity-edit path; refuses to edit redacted rows
 *   redactPerson       — tombstone: clear identity + all IDs (PII removed, not parked)
 *
 * Every mutation records an audit row and publishes an event.
 * Unique-violation errors (Postgres 23505) are caught and re-thrown as plain language.
 *
 * Design: wiki/slices/3-identity-and-credentials.md §5a
 * ADR: wiki/decisions/0017-person-centric-identity.md
 * Build plan: wiki/slices/3a-person-identity-plan.md Task 2
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/core/db';
import { isPgError } from '@/core/errors';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { persons, personCredentials, type Person, type NewPerson, type PersonCredential } from './schema';
import { checkIdFormat, normalizeNameKey, ANCHOR_ID_LABELS, type AnchorIdType, type CredType, type CredStatus } from './labels';

// ─── Column map ───────────────────────────────────────────────────────────────
// Maps each anchorIdType to its corresponding schema column name and Drizzle
// column reference.

type IdColumn = {
  columnRef: typeof persons.philsysNumber
                | typeof persons.sssNumber
                | typeof persons.tinNumber
                | typeof persons.passportNumber
                | typeof persons.umidNumber
                | typeof persons.driversLicenseNumber;
  fieldName: keyof Person;
};

/**
 * Returns the Drizzle column reference and the field name for a given anchorIdType.
 * Used for both exact-match queries and for building insert/update values.
 */
function getIdColumn(idType: Exclude<AnchorIdType, 'none'>): IdColumn {
  switch (idType) {
    case 'philsys':        return { columnRef: persons.philsysNumber,        fieldName: 'philsysNumber' };
    case 'sss':            return { columnRef: persons.sssNumber,             fieldName: 'sssNumber' };
    case 'tin':            return { columnRef: persons.tinNumber,             fieldName: 'tinNumber' };
    case 'passport':       return { columnRef: persons.passportNumber,        fieldName: 'passportNumber' };
    case 'umid':           return { columnRef: persons.umidNumber,            fieldName: 'umidNumber' };
    case 'drivers_license': return { columnRef: persons.driversLicenseNumber, fieldName: 'driversLicenseNumber' };
  }
}

/**
 * The ID field names that have partial-unique constraints (philsys/sss/tin).
 * Used to map Postgres 23505 constraint names to plain-language errors.
 */
const PARTIAL_UNIQUE_FIELDS: Record<string, AnchorIdType> = {
  persons_philsys_uq: 'philsys',
  persons_sss_uq:     'sss',
  persons_tin_uq:     'tin',
};

/**
 * Given a Postgres 23505 error, return a plain-language message if the
 * violation is one of the known partial-unique indexes. Otherwise returns null.
 */
function uniqueViolationMessage(err: unknown): string | null {
  if (!isPgError(err) || err.code !== '23505') return null;
  const e = err as Record<string, unknown>;
  const constraint = String(e.constraint_name ?? e.constraint ?? '');
  const detail = String(e.detail ?? '');

  // Match by constraint name first (most reliable).
  for (const [constraintName, idType] of Object.entries(PARTIAL_UNIQUE_FIELDS)) {
    if (constraint === constraintName || detail.toLowerCase().includes(idType)) {
      const label = ANCHOR_ID_LABELS[idType];
      // Avoid "SSS number number" — the label for sss already ends with "number"
      const suffix = label.toLowerCase().endsWith('number') ? '' : ' number';
      return `That ${label}${suffix} is already on file for another person.`;
    }
  }
  return null;
}

// ─── createPerson ─────────────────────────────────────────────────────────────

export type CreatePersonInput = {
  firstName:   string;
  lastName:    string;
  middleName?: string | null;
  suffix?:     string | null;
  dateOfBirth?: string | null;
  sex?:        'male' | 'female' | null;

  anchorIdType?: AnchorIdType;

  // Anchor / unique IDs
  philsysNumber?: string | null;
  sssNumber?:     string | null;
  tinNumber?:     string | null;

  // Member IDs
  philhealthNumber?: string | null;
  pagibigNumber?:    string | null;

  // Secondary IDs
  umidNumber?:           string | null;
  passportNumber?:       string | null;
  driversLicenseNumber?: string | null;

  // Address / contact
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?:         string | null;
  province?:     string | null;
  postalCode?:   string | null;
  phone?:        string | null;
  email?:        string | null;

  actorUserId?: string | null;
};

/**
 * Options for `createPerson`.
 * Pass `{ tx }` to run the Person INSERT inside an existing Drizzle transaction
 * so Person + role-row creation is atomic (no orphaned Person on role-insert failure).
 * Audit/events are NOT run inside the transaction — they use their own DB handle.
 */
export type CreatePersonOptions = {
  tx?: DbOrTx;
};

export async function createPerson(input: CreatePersonInput, opts?: CreatePersonOptions): Promise<Person> {
  // Use the caller's transaction if provided; otherwise fall back to the global db.
  const executor: DbOrTx = opts?.tx ?? getDb();
  const anchorIdType = input.anchorIdType ?? 'none';

  // When an anchor type is specified (not 'none'), validate that the corresponding
  // ID value is present.
  if (anchorIdType !== 'none') {
    const { fieldName } = getIdColumn(anchorIdType);
    const idValue = (input as Record<string, unknown>)[fieldName] as string | null | undefined;
    if (!idValue) {
      const label = ANCHOR_ID_LABELS[anchorIdType];
      throw new Error(`${label} number is required when anchorIdType is '${anchorIdType}'.`);
    }
  }

  const values: NewPerson = {
    firstName:   input.firstName.trim(),
    lastName:    input.lastName.trim(),
    middleName:  input.middleName ?? null,
    suffix:      input.suffix ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    sex:         input.sex ?? null,

    anchorIdType,

    philsysNumber:        input.philsysNumber ?? null,
    sssNumber:            input.sssNumber ?? null,
    tinNumber:            input.tinNumber ?? null,

    philhealthNumber: input.philhealthNumber ?? null,
    pagibigNumber:    input.pagibigNumber ?? null,

    umidNumber:           input.umidNumber ?? null,
    passportNumber:       input.passportNumber ?? null,
    driversLicenseNumber: input.driversLicenseNumber ?? null,

    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city:         input.city ?? null,
    province:     input.province ?? null,
    postalCode:   input.postalCode ?? null,
    phone:        input.phone ?? null,
    email:        input.email ?? null,
  };

  let created: Person;
  try {
    const [row] = await executor.insert(persons).values(values).returning();
    if (!row) throw new Error('[persons/createPerson] insert returned no row');
    created = row;
  } catch (err: unknown) {
    const plain = uniqueViolationMessage(err);
    if (plain) throw new Error(plain);
    throw err;
  }

  // Advisory format check — for audit payload only.
  let formatWarning: string | null = null;
  if (anchorIdType !== 'none') {
    const { fieldName } = getIdColumn(anchorIdType);
    const idValue = (created as Record<string, unknown>)[fieldName] as string | null;
    if (idValue) {
      formatWarning = checkIdFormat(anchorIdType, idValue);
    }
  }

  await audit.record({
    actor:   input.actorUserId ?? null,
    action:  'person.created',
    target:  { kind: 'person', id: created.id },
    payload: {
      name: `${created.lastName}, ${created.firstName}`,
      anchorIdType,
      ...(formatWarning ? { formatWarning } : {}),
    },
  });
  await events.publish('person.created', { id: created.id });

  return created;
}

// ─── assertAnchored ───────────────────────────────────────────────────────────

/**
 * Throws a plain-language error if the person's `anchorIdType === 'none'` or the
 * person doesn't exist. Resolves silently when an anchor ID is on file.
 *
 * Used as the hard gate in hireApplicant (ADR 0017 — "mandated at hire").
 */
export async function assertAnchored(personId: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select({ id: persons.id, anchorIdType: persons.anchorIdType })
    .from(persons)
    .where(eq(persons.id, personId));

  if (!row) {
    throw new Error(`Person not found — a government ID cannot be verified for someone who isn't on file.`);
  }
  if (row.anchorIdType === 'none') {
    throw new Error(
      'A government ID is required before this person can be hired. ' +
      'Add a PhilSys, SSS, or TIN number to their record first.',
    );
  }
}

// ─── getPerson ────────────────────────────────────────────────────────────────

/**
 * Fetches a Person by id. Returns null if not found.
 * Note: redacted persons are still returned — callers see `redactedAt` set
 * and identity fields cleared. This is by design (the row must persist for
 * FK integrity and audit history).
 */
export async function getPerson(id: string): Promise<Person | null> {
  const db = getDb();
  const [row] = await db.select().from(persons).where(eq(persons.id, id));
  return row ?? null;
}

// ─── findPersonByAnyId ────────────────────────────────────────────────────────

/**
 * Finds a person by an exact match on the column for `idType`, OR by a value
 * stored in `quarantinedIds` (format: one "type:value" per line).
 *
 * This means a quarantined duplicate is still findable — essential for
 * surfacing "we already know this person" at intake.
 */
export async function findPersonByAnyId(
  idType: AnchorIdType,
  idValue: string,
): Promise<Person | null> {
  if (!idValue) return null;
  const db = getDb();

  // Build the column-match condition for non-none types.
  if (idType !== 'none') {
    const { columnRef } = getIdColumn(idType);
    // Check quarantinedIds with line-anchored LIKE so "sss:34-5678901-2" does NOT
    // match "sss:34-5678901-20".  We wrap the field as '\n'||col||'\n' and search
    // for '\n<type>:<value>\n' so only a full line matches.
    const quarantinePattern = `\n${idType}:${idValue}\n`;

    const rows = await db
      .select()
      .from(persons)
      .where(
        sql`${columnRef} = ${idValue}
          OR '\n' || ${persons.quarantinedIds} || '\n' LIKE ${'%' + quarantinePattern + '%'}`,
      )
      .limit(1);
    return rows[0] ?? null;
  }

  // idType='none' — search for a "none:<value>" line in quarantinedIds.
  // Use a SQL LIKE filter so we don't pull every quarantined row into JS.
  const nonePattern = `\nnone:${idValue}\n`;
  const rows = await db
    .select()
    .from(persons)
    .where(
      sql`'\n' || ${persons.quarantinedIds} || '\n' LIKE ${'%' + nonePattern + '%'}`,
    )
    .limit(1);
  return rows[0] ?? null;
}

// ─── findPossibleDuplicates ───────────────────────────────────────────────────

/**
 * Returns all persons whose normalized name+DOB key matches the input.
 * `normalizeNameKey` collapses common PH surname particles (de la / dela / de)
 * so "Juan De La Cruz 1990-04-02" and "Juan Dela Cruz 1990-04-02" collide.
 *
 * Candidates are narrowed by exact `date_of_birth` IN SQL first (uses
 * `persons_dob_idx`), then the normalized name key is compared in JS so the
 * normalisation logic stays in one place (labels.ts). Even the worst real case —
 * a large "January 1st" unknown-birthday cluster — only loads that one date's
 * rows; the stress harness confirms this holds at 10k+ guards.
 */
export async function findPossibleDuplicates(input: {
  firstName:   string;
  lastName:    string;
  dateOfBirth?: string | null;
}): Promise<Person[]> {
  if (!input.dateOfBirth) return [];

  const db = getDb();
  const targetKey = normalizeNameKey(input.firstName, input.lastName, input.dateOfBirth);

  // Fetch candidates with the same DOB (narrow the scan before JS comparison).
  const candidates = await db
    .select()
    .from(persons)
    .where(eq(persons.dateOfBirth, input.dateOfBirth));

  return candidates.filter((p) => {
    const candidateKey = normalizeNameKey(p.firstName, p.lastName, p.dateOfBirth);
    return candidateKey === targetKey;
  });
}

// ─── updatePerson ─────────────────────────────────────────────────────────────

type UpdatePersonPatch = Partial<
  Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'redactedAt'>
>;

/**
 * The ONLY identity-edit path for a Person.
 *
 * Refuses to edit identity fields of a person whose `redactedAt` is set —
 * a redacted person is a tombstone and must not be silently re-populated.
 *
 * Updates `updatedAt` and records an audit trail of changed fields (mirroring
 * the pattern in `hr.updateEmployee`).
 */
export async function updatePerson(
  id: string,
  patch: UpdatePersonPatch,
  actorUserId?: string | null,
): Promise<Person> {
  const db = getDb();

  const before = await getPerson(id);
  if (!before) throw new Error(`Person not found — no person with id ${id}.`);

  if (before.redactedAt !== null) {
    throw new Error(
      'This person record has been redacted and cannot be edited. ' +
      'If you need to re-register this person, create a new record.',
    );
  }

  // Strip immutable fields the caller should not touch.
  // quarantinedIds and suspectedDuplicateOf are dedup-system fields — they must
  // not be silently wiped or overwritten via the identity-edit path.
  const IMMUTABLE = ['id', 'createdAt', 'redactedAt', 'quarantinedIds', 'suspectedDuplicateOf'] as const;
  const safePatch = { ...patch } as Record<string, unknown>;
  for (const field of IMMUTABLE) {
    delete safePatch[field];
  }

  // Name is NOT NULL and is the minimum identity a Person must carry — never let
  // an edit blank it out (the DB would reject a true NULL, but '' / whitespace
  // would slip through and leave an unnamed person). Reject before writing.
  for (const nameField of ['firstName', 'lastName'] as const) {
    if (nameField in safePatch) {
      const v = safePatch[nameField];
      if (typeof v === 'string' && v.trim() === '') {
        throw new Error('First name and last name cannot be blank.');
      }
    }
  }

  let updated: Person | undefined;
  try {
    [updated] = await db
      .update(persons)
      .set({ ...safePatch, updatedAt: new Date() })
      .where(eq(persons.id, id))
      .returning();
  } catch (err: unknown) {
    const plain = uniqueViolationMessage(err);
    if (plain) throw new Error(plain);
    throw err;
  }
  if (!updated) throw new Error(`[persons/updatePerson] update returned no row for ${id}`);

  const changedFields = Object.keys(safePatch).filter(
    (k) => (before as Record<string, unknown>)[k] !== (updated as Record<string, unknown>)[k],
  );

  await audit.record({
    actor:   actorUserId ?? null,
    action:  'person.updated',
    target:  { kind: 'person', id },
    payload: {
      before:        Object.fromEntries(changedFields.map((k) => [k, (before as Record<string, unknown>)[k]])),
      after:         Object.fromEntries(changedFields.map((k) => [k, (updated as Record<string, unknown>)[k]])),
      changedFields,
    },
  });
  await events.publish('person.updated', { id, changedFields });

  return updated;
}

// ─── redactPerson ─────────────────────────────────────────────────────────────

/**
 * Genuine PII removal (ADR 0017 — Retention section).
 *
 * Sets `redactedAt = now()`, clears ALL identity fields (nulls IDs, DOB,
 * address, contact; sets firstName/lastName to '[redacted]' since they are
 * NOT NULL), resets `anchorIdType` to 'none', and sets `quarantinedIds` to
 * null.
 *
 * **Privacy correctness:** `quarantinedIds` is for the dedup backfill case
 * only (a legitimate person whose unique-ID slot was taken by a colliding
 * record). It is NOT a privacy bucket. Parking a redacted person's IDs there
 * would re-expose PII in a different column. Redaction means the IDs are gone —
 * `findPersonByAnyId` will NOT resurface this person by their old ID after
 * redaction (that is the point).
 *
 * The audit payload records only the *types* that were cleared, not the
 * actual ID values (which would re-leak PII into the audit log).
 *
 * The row, personId FKs, and all audit history are preserved.
 * Government exports snapshot identity at generation time, so redacting later
 * never blanks a historical form.
 */
export async function redactPerson(
  id: string,
  actorUserId?: string | null,
): Promise<Person> {
  const db = getDb();

  const before = await getPerson(id);
  if (!before) throw new Error(`Person not found — no person with id ${id}.`);

  // Collect the *types* of IDs that were set — for the audit payload only.
  // We do NOT record the actual values (that would re-leak PII).
  const clearedIdTypes: string[] = [];
  if (before.philsysNumber)        clearedIdTypes.push('philsys');
  if (before.sssNumber)            clearedIdTypes.push('sss');
  if (before.tinNumber)            clearedIdTypes.push('tin');
  if (before.philhealthNumber)     clearedIdTypes.push('philhealth');
  if (before.pagibigNumber)        clearedIdTypes.push('pagibig');
  if (before.umidNumber)           clearedIdTypes.push('umid');
  if (before.passportNumber)       clearedIdTypes.push('passport');
  if (before.driversLicenseNumber) clearedIdTypes.push('drivers_license');

  const [updated] = await db
    .update(persons)
    .set({
      // Tombstone marker
      redactedAt: new Date(),

      // Clear identity — firstName/lastName are NOT NULL so use placeholder
      firstName:   '[redacted]',
      lastName:    '[redacted]',
      middleName:  null,
      suffix:      null,
      dateOfBirth: null,
      sex:         null,

      // Clear all IDs — unique slots vacated; PII is truly removed (not parked)
      philsysNumber:        null,
      sssNumber:            null,
      tinNumber:            null,
      philhealthNumber:     null,
      pagibigNumber:        null,
      umidNumber:           null,
      passportNumber:       null,
      driversLicenseNumber: null,

      // Reset anchor type
      anchorIdType: 'none',

      // Clear address / contact
      addressLine1: null,
      addressLine2: null,
      city:         null,
      province:     null,
      postalCode:   null,
      phone:        null,
      email:        null,

      // quarantinedIds is for the dedup backfill case only — null it so we
      // don't accidentally surface PII through findPersonByAnyId after redaction.
      quarantinedIds: null,

      updatedAt: new Date(),
    })
    .where(eq(persons.id, id))
    .returning();
  if (!updated) throw new Error(`[persons/redactPerson] update returned no row for ${id}`);

  await audit.record({
    actor:   actorUserId ?? null,
    action:  'person.redacted',
    target:  { kind: 'person', id },
    payload: {
      previousAnchorIdType: before.anchorIdType,
      // Types only — actual values are NOT logged (would re-leak PII).
      clearedIdTypes,
    },
  });
  await events.publish('person.redacted', { id });

  return updated;
}

// ─── Credentials wallet (Slice 3b — ADR 0018) ───────────────────────────────────
//
// Credentials are owned by a Person; every mutation is audited against the
// Person (the aggregate root) with a `person.credential.*` action so a person's
// full history — identity edits AND credential changes — reads as one trail.

export type AddCredentialInput = {
  personId:    string;
  credType:    CredType;
  credNumber?: string | null;
  issuingBody?: string | null;
  issuedOn?:   string | null;
  expiresOn?:  string | null;
  status?:     CredStatus;          // defaults to 'valid'
  verifiedByUserId?: string | null;
  verifiedOn?: string | null;
  notes?:      string | null;
  actorUserId?: string | null;
};

/**
 * Options for `addCredential`. Pass `{ tx }` so the insert runs inside an
 * existing transaction — `hireApplicant` carries verified clearances forward
 * atomically with the hire. Audit/events use their own handle (as elsewhere).
 */
export type AddCredentialOptions = {
  tx?: DbOrTx;
};

/**
 * Adds a credential to a Person's wallet and returns the created row.
 * `status` defaults to 'valid'. Records a `person.credential.added` audit row.
 */
export async function addCredential(
  input: AddCredentialInput,
  opts?: AddCredentialOptions,
): Promise<PersonCredential> {
  const executor: DbOrTx = opts?.tx ?? getDb();

  const values = {
    personId:         input.personId,
    credType:         input.credType,
    credNumber:       input.credNumber ?? null,
    issuingBody:      input.issuingBody ?? null,
    issuedOn:         input.issuedOn ?? null,
    expiresOn:        input.expiresOn ?? null,
    status:           input.status ?? 'valid',
    verifiedByUserId: input.verifiedByUserId ?? null,
    verifiedOn:       input.verifiedOn ?? null,
    notes:            input.notes ?? null,
  };

  const [created] = await executor.insert(personCredentials).values(values).returning();
  if (!created) throw new Error('[persons/addCredential] insert returned no row');

  await audit.record({
    actor:   input.actorUserId ?? null,
    action:  'person.credential.added',
    target:  { kind: 'person', id: input.personId },
    payload: {
      credId:    created.id,
      credType:  created.credType,
      status:    created.status,
      expiresOn: created.expiresOn,
    },
  });
  await events.publish('person.credential.added', { personId: input.personId, credId: created.id });

  return created;
}

// ─── updateCredential ─────────────────────────────────────────────────────────

type UpdateCredentialPatch = Partial<
  Omit<PersonCredential, 'id' | 'personId' | 'createdAt' | 'updatedAt'>
>;

/**
 * Updates a credential and returns the updated row. Records the changed fields
 * in a `person.credential.updated` audit row (targeted at the owning Person).
 * Throws a plain-language error if the credential does not exist.
 */
export async function updateCredential(
  id: string,
  patch: UpdateCredentialPatch,
  actorUserId?: string | null,
): Promise<PersonCredential> {
  const db = getDb();

  const [before] = await db.select().from(personCredentials).where(eq(personCredentials.id, id));
  if (!before) throw new Error(`Credential not found — no credential with id ${id}.`);

  // personId / id / timestamps are not caller-editable.
  const IMMUTABLE = ['id', 'personId', 'createdAt'] as const;
  const safePatch = { ...patch } as Record<string, unknown>;
  for (const field of IMMUTABLE) delete safePatch[field];

  const [updated] = await db
    .update(personCredentials)
    .set({ ...safePatch, updatedAt: new Date() })
    .where(eq(personCredentials.id, id))
    .returning();
  if (!updated) throw new Error(`[persons/updateCredential] update returned no row for ${id}`);

  const changedFields = Object.keys(safePatch).filter(
    (k) => (before as Record<string, unknown>)[k] !== (updated as Record<string, unknown>)[k],
  );

  await audit.record({
    actor:   actorUserId ?? null,
    action:  'person.credential.updated',
    target:  { kind: 'person', id: updated.personId },
    payload: {
      credId:   id,
      credType: updated.credType,
      changedFields,
      before:   Object.fromEntries(changedFields.map((k) => [k, (before as Record<string, unknown>)[k]])),
      after:    Object.fromEntries(changedFields.map((k) => [k, (updated as Record<string, unknown>)[k]])),
    },
  });
  await events.publish('person.credential.updated', { personId: updated.personId, credId: id, changedFields });

  return updated;
}

// ─── listCredentials ──────────────────────────────────────────────────────────

/**
 * Returns a Person's credentials, ordered by type then soonest expiry (NULL
 * expiries last). The display layer derives Valid/Expiring/Expired/etc. via
 * `deriveCredState` (labels.ts) — this is a plain read, no state computed here.
 */
export async function listCredentials(personId: string): Promise<PersonCredential[]> {
  const db = getDb();
  return db
    .select()
    .from(personCredentials)
    .where(eq(personCredentials.personId, personId))
    .orderBy(personCredentials.credType, sql`${personCredentials.expiresOn} ASC NULLS LAST`);
}

/**
 * Batch read: every credential for the given persons, in ONE query. Used by the
 * readiness radar (recruitment/service) to avoid an N+1 over thousands of guards.
 * Returns `[]` for an empty input rather than issuing a degenerate `IN ()` query.
 * The caller groups by `personId`.
 */
export async function listCredentialsForPersons(personIds: string[]): Promise<PersonCredential[]> {
  if (personIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(personCredentials)
    .where(inArray(personCredentials.personId, personIds));
}
