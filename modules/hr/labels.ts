/**
 * UI-facing labels + state-machine constants for the HR module. Importing
 * from here (instead of redefining locally in each page) keeps the wording
 * consistent and means a single rename propagates everywhere.
 */

import type { Employee } from './schema';

export type Status = Employee['status'];
export type EmploymentType = Employee['employmentType'];
export type PayFrequency = Employee['payFrequency'];

export const STATUS_LABELS: Record<Status, string> = {
  applicant: 'Applicant',
  hired: 'Hired',
  deployed: 'Deployed',
  reliever: 'Reliever',
  floating: 'Floating',
  on_leave: 'On leave',
  terminated: 'Terminated',
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  GUARD: 'Guard',
  OFFICE_STAFF: 'Office staff',
  SUPERVISOR: 'Supervisor',
  DRIVER: 'Driver',
  JANITOR: 'Janitor',
  OTHER: 'Other',
};

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  MONTHLY: 'Monthly',
  SEMI_MONTHLY: 'Semi-monthly (twice a month)',
};

/**
 * Status state machine — what `next` statuses are reachable from each
 * `current`. The single source of truth: `modules/hr/service.ts` enforces
 * this matrix on every `changeStatus` call; the change-status UI consults
 * the same matrix to render only the valid options. `terminated` is terminal
 * here — its escape hatch is `hr.undoTermination` (5-min window).
 */
export const ALLOWED_TRANSITIONS: Record<Status, readonly Status[]> = {
  applicant: ['hired', 'terminated'],
  hired: ['deployed', 'reliever', 'floating', 'on_leave', 'terminated'],
  deployed: ['hired', 'floating', 'reliever', 'on_leave', 'terminated'],
  reliever: ['hired', 'deployed', 'floating', 'on_leave', 'terminated'],
  floating: ['hired', 'deployed', 'reliever', 'on_leave', 'terminated'],
  on_leave: ['hired', 'deployed', 'reliever', 'floating', 'terminated'],
  terminated: [],
};

// ─── Licence readiness radar (Slice 3b) ───────────────────────────────────────
// Readiness is an employee concern (a deployed guard's licence health), so it
// lives in hr. The radar UI page sits under /recruitment by design; the service
// + these labels are hr's.

/**
 * The kinds of issue the readiness radar reports for a required credential.
 * `unverified` is the LTOPF-specific row for a *valid* firearms licence that the
 * radar still surfaces because the firearm-to-guard link isn't tracked yet
 * (ADR 0018 — never a clean all-clear on firearms). The others map 1:1 to a
 * derived credential state; `missing` means no credential row of that required
 * type exists at all.
 *
 * The firearm caveat itself is carried by the separate `firearmLinkUnverified`
 * flag on the issue (set for an LTOPF in ANY state), and the radar renders it as
 * its own badge — so the caveat shows even when the licence is expiring/expired,
 * not only when it is valid.
 */
export type ReadinessKind = 'missing' | 'expiring' | 'expired' | 'revoked' | 'pending' | 'unverified';

export const READINESS_KIND_LABELS: Record<ReadinessKind, string> = {
  missing:    'Missing (required)',
  expiring:   'Expiring',
  expired:    'Expired',
  revoked:    'Revoked',
  pending:    'Pending verification',
  unverified: 'Valid',
};

/** The caveat badge shown whenever an issue carries `firearmLinkUnverified`. */
export const FIREARM_LINK_UNVERIFIED_LABEL = 'Firearm link unverified';
