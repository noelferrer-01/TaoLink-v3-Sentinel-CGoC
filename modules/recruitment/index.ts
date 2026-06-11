import {
  createApplicant,
  getApplicant,
  listApplicantsPage,
  advanceStage,
  setDocument,
  rejectApplicant,
  withdrawApplicant,
  checkMatches,
  addToBlacklist,
  listBlacklist,
  removeFromBlacklist,
  hireApplicant,
} from './service';

export type {
  CreateApplicantInput, HireMeta, Match, MatchKind, ApplicantIdentity,
} from './service';
export {
  STAGE_LABELS,
  SOURCE_LABELS,
  DOC_TYPE_LABELS,
  DOC_STATUS_LABELS,
  MATCH_KIND_LABELS,
  ALLOWED_TRANSITIONS,
  requiredDocsFor,
  DOC_TO_CRED_TYPE,
  type Stage,
  type Source,
  type DocType,
  type DocStatus,
} from './labels';
export type { Applicant, ApplicantDocument, BlacklistEntry } from './schema';

export const recruitment = {
  createApplicant,
  getApplicant,
  listApplicantsPage,
  advanceStage,
  setDocument,
  rejectApplicant,
  withdrawApplicant,
  checkMatches,
  addToBlacklist,
  listBlacklist,
  removeFromBlacklist,
  hireApplicant,
};

export {
  createApplicant,
  getApplicant,
  listApplicantsPage,
  advanceStage,
  setDocument,
  rejectApplicant,
  withdrawApplicant,
  checkMatches,
  addToBlacklist,
  listBlacklist,
  removeFromBlacklist,
  hireApplicant,
};
