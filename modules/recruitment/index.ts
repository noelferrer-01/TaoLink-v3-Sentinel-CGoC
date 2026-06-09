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

export type { CreateApplicantInput, HireMeta, Match, MatchKind } from './service';
export {
  STAGE_LABELS,
  SOURCE_LABELS,
  DOC_TYPE_LABELS,
  DOC_STATUS_LABELS,
  ALLOWED_TRANSITIONS,
  requiredDocsFor,
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
