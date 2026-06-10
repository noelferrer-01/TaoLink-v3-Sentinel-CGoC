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
  listReadinessIssues,
} from './service';

export type {
  CreateApplicantInput, HireMeta, Match, MatchKind, ApplicantIdentity,
  ReadinessIssue, ReadinessQuery,
} from './service';
export {
  STAGE_LABELS,
  SOURCE_LABELS,
  DOC_TYPE_LABELS,
  DOC_STATUS_LABELS,
  MATCH_KIND_LABELS,
  ALLOWED_TRANSITIONS,
  requiredDocsFor,
  READINESS_KIND_LABELS,
  type Stage,
  type Source,
  type DocType,
  type DocStatus,
  type ReadinessKind,
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
  listReadinessIssues,
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
  listReadinessIssues,
};
