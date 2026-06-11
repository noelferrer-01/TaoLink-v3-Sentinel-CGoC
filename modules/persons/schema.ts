/**
 * Persons module schema — single source of truth for human identity.
 *
 * A Person owns all identity (legal name, DOB, sex, all statutory / government
 * IDs, address, contact). `hr_employees` and `recruitment_applicants` are role
 * rows that reference this table; they hold only role-specific data.
 *
 * Implements ADR 0017 (person-centric identity) and ADR 0018 (credentials as
 * first-class durable records — the `person_credentials` wallet, Slice 3b).
 * Design: wiki/slices/3-identity-and-credentials.md §5a.
 * Build plan: wiki/slices/3a-person-identity-plan.md Task 1 (persons),
 *             wiki/slices/3b-credentials-and-readiness-plan.md Task 1 (credentials).
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  date,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from '@/modules/auth/schema';

// ─── Enums ─────────────────────────────────────────────────────────────────────

export const personSex = pgEnum('person_sex', ['male', 'female']);

/**
 * The anchor ID type recorded on the Person.
 * Ladder (most authoritative first): philsys → sss → tin → passport → umid → drivers_license.
 * `none` = provisional / legacy — accepted at intake; hard-required only at hire.
 */
export const personAnchorIdType = pgEnum('person_anchor_id_type', [
  'philsys',
  'sss',
  'tin',
  'passport',
  'umid',
  'drivers_license',
  'none',
]);

// ─── Table ─────────────────────────────────────────────────────────────────────

export const persons = pgTable('persons', {
  id: uuid('id').primaryKey().defaultRandom(),

  // ── Name / bio ───────────────────────────────────────────────────────────────
  firstName:   text('first_name').notNull(),
  lastName:    text('last_name').notNull(),
  middleName:  text('middle_name'),
  suffix:      text('suffix'),
  dateOfBirth: date('date_of_birth'),
  /**
   * sex is nullable forever — never block a save on a missing sex value.
   * (ADR 0017 discipline rule)
   */
  sex: personSex('sex'),

  // ── Anchor IDs (unique, partial) ─────────────────────────────────────────────
  // One-per-person nationally. NULLs are allowed (partial unique: WHERE NOT NULL).
  // Uniqueness enforced only here — passport/UMID/DL get reissued so they are
  // never unique. Format validation is advisory (checkIdFormat in labels.ts).
  philsysNumber: text('philsys_number'),
  sssNumber:     text('sss_number'),
  tinNumber:     text('tin_number'),

  // ── Member IDs (stored, non-unique) ──────────────────────────────────────────
  // Statutory; restored from v2 data-loss bug (both had no destination in v2).
  philhealthNumber: text('philhealth_number'),
  pagibigNumber:    text('pagibig_number'),

  // ── Secondary IDs (lookup, non-unique) ───────────────────────────────────────
  // These get reissued/recycled — a UNIQUE constraint would wrongly block intake.
  // Plain lookup indexes only.
  umidNumber:           text('umid_number'),
  passportNumber:       text('passport_number'),
  driversLicenseNumber: text('drivers_license_number'),

  // ── Anchor marker ────────────────────────────────────────────────────────────
  // Records which ID type is currently used as the canonical anchor.
  // `none` is a first-class value (provisional / legacy persons).
  anchorIdType: personAnchorIdType('anchor_id_type').notNull().default('none'),

  // ── Address / contact ────────────────────────────────────────────────────────
  // email is non-unique: applicants re-apply, share emails, or lack one.
  // System authentication uses the separate `users` table.
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city:         text('city'),
  province:     text('province'),
  postalCode:   varchar('postal_code', { length: 8 }),  // lenient — PH is 4-digit but allow flexibility
  phone:        text('phone'),
  email:        text('email'),

  // ── Dedup / retention ────────────────────────────────────────────────────────
  /**
   * Self-FK: set when this Person was quarantined as a suspected duplicate of
   * another. Both sides are linked (two-sided). The backfill sets this when a
   * unique-ID collision is detected; human review resolves it.
   */
  suspectedDuplicateOf: uuid('suspected_duplicate_of'),

  /**
   * Holds an ID value that was quarantined because the unique slot was already
   * taken by another Person. Kept as a searchable text blob so
   * `findPersonByAnyId` can still surface this Person via the quarantined value.
   * Format: one value per line, e.g. "sss:123456789\ntin:987654321".
   */
  quarantinedIds: text('quarantined_ids'),

  /**
   * Tombstone marker for soft redaction. When set, identity fields are nulled
   * (by `redactPerson`) but the row, FKs, and unique-ID slots are preserved.
   * Exports snapshot identity at generation time so redacting later never blanks
   * a historical form.
   */
  redactedAt: timestamp('redacted_at', { withTimezone: true }),

  // ── Timestamps ───────────────────────────────────────────────────────────────
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Partial unique indexes — enforce one-per-person but allow NULL (not-yet-entered).
  // The WHERE IS NOT NULL clause means two NULL values are not considered duplicates.
  philsysUq: uniqueIndex('persons_philsys_uq').on(t.philsysNumber).where(sql`${t.philsysNumber} IS NOT NULL`),
  sssUq:     uniqueIndex('persons_sss_uq').on(t.sssNumber).where(sql`${t.sssNumber} IS NOT NULL`),
  tinUq:     uniqueIndex('persons_tin_uq').on(t.tinNumber).where(sql`${t.tinNumber} IS NOT NULL`),

  // Plain lookup indexes for secondary IDs (non-unique — reissued/recycled).
  umidIdx:     index('persons_umid_idx').on(t.umidNumber),
  passportIdx: index('persons_passport_idx').on(t.passportNumber),
  dlIdx:       index('persons_dl_idx').on(t.driversLicenseNumber),

  // Support fast anchor-type filtering (e.g. list all `none` persons still needing an ID).
  anchorTypeIdx: index('persons_anchor_type_idx').on(t.anchorIdType),

  // DOB is a matcher hot path (name+DOB duplicate detection) — added in 0024.
  dobIdx: index('persons_dob_idx').on(t.dateOfBirth),

  // GIN trigram index on (first_name || ' ' || last_name) is hand-added in the
  // migration SQL (0021_persons.sql) — Drizzle cannot emit USING gin expressions.
  // Index name: persons_fullname_trgm
}));

// ─── Inferred types ───────────────────────────────────────────────────────────

export type Person    = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;

// ─── Credentials wallet (Slice 3b — ADR 0018) ──────────────────────────────────

/**
 * Credential types that live in a Person's licence wallet.
 *
 * Spellings match `recruitment_doc_type` EXACTLY so the hire doc→credential
 * carry-forward (recruitment/service.ts) can't silently drop a type — but this
 * enum holds ONLY the 9 credential-bearing types and excludes `resume_biodata`
 * and `other` (those are documents, not credentials). See Slice 3b plan delta 2.
 */
export const personCredType = pgEnum('person_cred_type', [
  'nbi_clearance',
  'police_pnp_clearance',
  'barangay_clearance',
  'drug_test',
  'medical_exam',
  'neuro_psych',
  'training_cert_sbr_rtc',
  'sosia_license',
  'ltopf_license',
]);

/**
 * Stored lifecycle status of a credential. `revoked` is kept DISTINCT from
 * `expired` — a revoked licence is a compliance event, not a quiet lapse.
 * The *display* state (labels.ts `deriveCredState`) layers `expiring` on top.
 */
export const personCredStatus = pgEnum('person_cred_status', [
  'valid',
  'expired',
  'pending',
  'revoked',
]);

export const personCredentials = pgTable('person_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),

  // The Person who holds this credential. CASCADE: a credential has no
  // independent retention value, so redacting/removing the Person clears it.
  personId: uuid('person_id').notNull().references(() => persons.id, { onDelete: 'cascade' }),

  credType:    personCredType('cred_type').notNull(),
  credNumber:  text('cred_number'),
  issuingBody: text('issuing_body'),
  issuedOn:    date('issued_on'),
  expiresOn:   date('expires_on'),
  status:      personCredStatus('status').notNull().default('valid'),

  // Who verified it (recruitment clearance verification at hire, or HR later).
  // SET NULL: the credential outlives the user account that recorded it.
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  verifiedOn:       date('verified_on'),

  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // FK/join hot path — listCredentials(personId) and the readiness diff.
  personIdIdx: index('person_credentials_person_id_idx').on(t.personId),
}));

export type PersonCredential    = typeof personCredentials.$inferSelect;
export type NewPersonCredential = typeof personCredentials.$inferInsert;
