/**
 * Persons module — public surface.
 *
 * This file re-exports only what other modules and pages should import.
 * Do NOT import from persons/schema.ts or persons/labels.ts directly outside
 * this module — always go through persons/index.ts.
 */

// ─── Schema types ─────────────────────────────────────────────────────────────

export type { Person, NewPerson, PersonCredential, NewPersonCredential } from './schema';
export {
  persons,
  personSex,
  personAnchorIdType,
  personCredentials,
  personCredType,
  personCredStatus,
} from './schema';

// ─── Labels + helpers ─────────────────────────────────────────────────────────

export {
  ANCHOR_ID_LABELS,
  ID_TYPE_LADDER,
  normalizeNameKey,
  checkIdFormat,
  type AnchorIdType,
  type AnchorIdTypeNonNone,
  // Credentials (Slice 3b)
  CRED_TYPE_LABELS,
  CRED_STATUS_LABELS,
  CRED_WINDOW_DAYS,
  deriveCredState,
  READINESS_CRED_SET,
  type CredType,
  type CredStatus,
  type CredState,
} from './labels';

// ─── Service functions ────────────────────────────────────────────────────────

export {
  createPerson,
  assertAnchored,
  getPerson,
  findPersonByAnyId,
  findPossibleDuplicates,
  updatePerson,
  redactPerson,
  type CreatePersonInput,
  type CreatePersonOptions,
} from './service';

// ─── Name-search primitives (shared by hr + recruitment) ───────────────────────

export {
  NAME_SEARCH_THRESHOLD,
  escapeLike,
  personFullNameMatches,
  personFullNameSimilarityDesc,
  withNameSearchThreshold,
} from './search';
