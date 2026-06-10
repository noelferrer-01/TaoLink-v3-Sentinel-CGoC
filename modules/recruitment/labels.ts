/**
 * UI-facing labels + state-machine constants for the Recruitment module.
 * Importing from here (instead of redefining locally in each page) keeps the
 * wording consistent and means a single rename propagates everywhere.
 * Mirrors the modules/hr/labels.ts pattern.
 */

import type { Applicant, ApplicantDocument } from './schema';

export type Stage = Applicant['pipelineStage'];
export type Source = Applicant['source'];
export type DocType = ApplicantDocument['docType'];
export type DocStatus = ApplicantDocument['status'];

/**
 * The kinds of match `checkMatches` can return. Defined here (client-safe) so
 * both the applicant detail page and the intake form can label them without
 * pulling server-only service code into the client bundle.
 */
export type MatchKind =
  | 'terminated_employee'
  | 'active_employee'
  | 'concurrent_applicant'
  | 'blacklist';

export const MATCH_KIND_LABELS: Record<MatchKind, string> = {
  blacklist:            'Blacklist',
  terminated_employee:  'Terminated employee',
  active_employee:      'Active employee',
  concurrent_applicant: 'Concurrent application',
};

export const STAGE_LABELS: Record<Stage, string> = {
  applied: 'Applied',
  contacted: 'Contacted',
  documents: 'Documents complete',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const SOURCE_LABELS: Record<Source, string> = {
  walk_in: 'Walk-in',
  referral: 'Referral',
  agency: 'Recruitment agency',
  job_board: 'Online job board',
  social_media: 'Social media',
  provincial: 'Provincial sourcing',
  training_school: 'Training school',
  other: 'Other',
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  nbi_clearance: 'NBI clearance',
  police_pnp_clearance: 'PNP / police clearance',
  barangay_clearance: 'Barangay clearance',
  drug_test: 'Drug test',
  medical_exam: 'Medical exam',
  neuro_psych: 'Neuro-psychological exam',
  training_cert_sbr_rtc: 'Security training cert (SBR/RTC)',
  sosia_license: 'SOSIA license',
  ltopf_license: 'LTOPF license (firearms)',
  resume_biodata: 'Resume / bio-data',
  other: 'Other',
};

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  verified: 'Verified',
  expired: 'Expired',
};

/**
 * Stage state machine — what `next` stages are reachable from each `current`.
 * `service.ts` enforces this on every advanceStage call; the UI consults the
 * same matrix to render only valid options. hired/rejected/withdrawn are
 * terminal (hire happens via hireApplicant, which also creates the employee).
 */
export const ALLOWED_TRANSITIONS: Record<Stage, readonly Stage[]> = {
  applied: ['contacted', 'rejected', 'withdrawn'],
  contacted: ['documents', 'rejected', 'withdrawn'],
  documents: ['hired', 'rejected', 'withdrawn'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

/**
 * Required clearances before an applicant is "documents complete".
 * Standard PH security set (questionnaire D2.5 / D5). LTOPF only for armed
 * posts. Edit here when the client confirms D5 — single source of truth.
 */
const BASE_REQUIRED_DOCS: readonly DocType[] = [
  'nbi_clearance',
  'police_pnp_clearance',
  'barangay_clearance',
  'drug_test',
  'medical_exam',
  'neuro_psych',
  'training_cert_sbr_rtc',
  'sosia_license',
  'resume_biodata',
];

export function requiredDocsFor(isArmedPost: boolean): readonly DocType[] {
  return isArmedPost ? [...BASE_REQUIRED_DOCS, 'ltopf_license'] : BASE_REQUIRED_DOCS;
}
