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
