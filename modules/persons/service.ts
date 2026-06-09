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
 *   redactPerson       — tombstone: clear identity, move anchor to quarantinedIds
 *
 * Every mutation records an audit row and publishes an event.
 * Unique-violation errors (Postgres 23505) are caught and re-thrown as plain language.
 *
 * Design: wiki/slices/3-identity-and-credentials.md §5a
 * ADR: wiki/decisions/0017-person-centric-identity.md
 * Build plan: wiki/slices/3a-person-identity-plan.md Task 2
 */

import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { persons, type Person, type NewPerson } from './schema';
import { checkIdFormat, normalizeNameKey, ANCHOR_ID_LABELS, type AnchorIdType } from './labels';

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
  const e = err as Record<string, unknown>;
  if (e.code !== '23505') return null;
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

export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const db = getDb();
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
    // Advisory format check — attach warning to audit payload but do NOT reject.
    const warning = checkIdFormat(anchorIdType, idValue);
    if (warning) {
      // Logged to audit payload below — not a gate.
      void warning; // acknowledged; used in audit payload
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
    const [row] = await db.insert(persons).values(values).returning();
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
    // Also check quarantinedIds for "type:value" lines.
    const quarantinePattern = `${idType}:${idValue}`;

    const rows = await db
      .select()
      .from(persons)
      .where(
        sql`${columnRef} = ${idValue}
          OR ${persons.quarantinedIds} LIKE ${'%' + quarantinePattern + '%'}`,
      )
      .limit(1);
    return rows[0] ?? null;
  }

  // idType='none' — only check quarantinedIds
  const rows = await db
    .select()
    .from(persons)
    .where(sql`${persons.quarantinedIds} IS NOT NULL`)
    .limit(100);
  // Filter client-side for quarantine matches — pattern is simple
  const hit = rows.find((r) =>
    r.quarantinedIds?.split('\n').some((line) => line.trim() === `none:${idValue}`),
  );
  return hit ?? null;
}

// ─── findPossibleDuplicates ───────────────────────────────────────────────────

/**
 * Returns all persons whose normalized name+DOB key matches the input.
 * `normalizeNameKey` collapses common PH surname particles (de la / dela / de)
 * so "Juan De La Cruz 1990-04-02" and "Juan Dela Cruz 1990-04-02" collide.
 *
 * The match is done in JS over all persons (not SQL) to keep the normalisation
 * logic in one place (labels.ts). For the 10k-guard scale this is acceptable
 * in the intake path; if needed, the GIN trigram index + SQL approach is a
 * direct-drop refactor (same public API).
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
  const IMMUTABLE = ['id', 'createdAt', 'redactedAt'] as const;
  const safePatch = { ...patch } as Record<string, unknown>;
  for (const field of IMMUTABLE) {
    delete safePatch[field];
  }

  const [updated] = await db
    .update(persons)
    .set({ ...safePatch, updatedAt: new Date() })
    .where(eq(persons.id, id))
    .returning();
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
 * Tombstone mechanism for soft redaction (ADR 0017 — Retention section).
 *
 * Sets `redactedAt = now()`, clears all identity fields (nulls IDs, DOB,
 * address, contact; sets firstName/lastName to '[redacted]' since they are
 * NOT NULL), and resets `anchorIdType` to 'none'.
 *
 * **Unique-slot tombstoning:**
 * The anchor ID value is moved into `quarantinedIds` (format:
 * "<type>:<value>") before the column is nulled. This ensures the value
 * remains findable via `findPersonByAnyId` and is NOT silently freed — the
 * intent is that operators see the tombstone record when they enter the same
 * ID at intake, rather than creating a phantom duplicate. The physical unique
 * constraint is vacated (NULL is allowed), but the tombstone in quarantinedIds
 * acts as the lookup anchor.
 *
 * NOTE: because the unique column is NULLed, a new person CAN technically be
 * created with the same ID value after redaction. The tombstone + lookup via
 * findPersonByAnyId is the safety net. If we need a hard "never re-use this
 * ID" guarantee, the correct mechanism is a separate blacklist table — which is
 * out of scope for this task (ADR 0017 defers the purge policy).
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

  // Build the tombstone entry for quarantinedIds.
  // Move any existing anchor ID into quarantinedIds so it remains findable.
  const tombstoneLines: string[] = [];
  if (before.quarantinedIds) {
    tombstoneLines.push(...before.quarantinedIds.split('\n').filter(Boolean));
  }

  // If the person had a real anchor ID, record it as a tombstone marker.
  if (before.anchorIdType !== 'none') {
    const { fieldName } = getIdColumn(before.anchorIdType as Exclude<AnchorIdType, 'none'>);
    const idValue = (before as Record<string, unknown>)[fieldName] as string | null;
    if (idValue) {
      const tombstoneLine = `${before.anchorIdType}:${idValue}`;
      if (!tombstoneLines.includes(tombstoneLine)) {
        tombstoneLines.push(tombstoneLine);
      }
    }
  }

  // Also tombstone all other unique IDs (philsys/sss/tin) that are set.
  const uniqueFields: Array<[Exclude<AnchorIdType, 'none'>, string | null]> = [
    ['philsys', before.philsysNumber],
    ['sss',     before.sssNumber],
    ['tin',     before.tinNumber],
  ];
  for (const [idType, idValue] of uniqueFields) {
    if (idValue) {
      const tombstoneLine = `${idType}:${idValue}`;
      if (!tombstoneLines.includes(tombstoneLine)) {
        tombstoneLines.push(tombstoneLine);
      }
    }
  }

  const quarantinedIds = tombstoneLines.length > 0 ? tombstoneLines.join('\n') : null;

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

      // Clear all IDs (unique slot vacated; tombstone value moved to quarantinedIds)
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

      // Store the tombstone
      quarantinedIds,

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
      tombstonedIds: tombstoneLines,
    },
  });
  await events.publish('person.redacted', { id });

  return updated;
}
