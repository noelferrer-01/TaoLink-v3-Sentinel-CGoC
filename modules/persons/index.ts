/**
 * Persons module — public surface.
 *
 * This file re-exports only what other modules and pages should import.
 * Do NOT import from persons/schema.ts or persons/labels.ts directly outside
 * this module — always go through persons/index.ts.
 *
 * Service functions (createPerson, assertAnchored, findPersonByAnyId, etc.)
 * will be added in Task 2 (persons/service.ts) and re-exported here.
 */

// ─── Schema types ─────────────────────────────────────────────────────────────

export type { Person, NewPerson } from './schema';
export { persons, personSex, personAnchorIdType } from './schema';

// ─── Labels + helpers ─────────────────────────────────────────────────────────

export {
  ANCHOR_ID_LABELS,
  ID_TYPE_LADDER,
  normalizeNameKey,
  checkIdFormat,
  type AnchorIdType,
  type AnchorIdTypeNonNone,
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
