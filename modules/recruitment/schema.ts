/**
 * Recruitment module schema — the HRIS front door.
 *
 * Applicants are a SEPARATE entity from employees (ADR 0004): a person has no
 * `hr_employees` row, no employee code, no payroll record until they are hired.
 * `recruitment.hireApplicant` performs the ADR 0009 handoff to `hr.createEmployee`.
 *
 * Cross-schema imports (employees, users, employmentType) follow the existing
 * pattern — payroll/dtr/assignments all import `employees` from hr/schema for FKs.
 */

import { pgTable, pgEnum, uuid, text, date, boolean, timestamp } from 'drizzle-orm/pg-core';
import { employees, employmentType } from '@/modules/hr/schema';
import { users } from '@/modules/auth/schema';
import { persons } from '@/modules/persons/schema';

// ─── Enums ─────────────────────────────────────────────────────────────────────

export const recruitmentStage = pgEnum('recruitment_stage', [
  'applied', 'contacted', 'documents', 'hired', 'rejected', 'withdrawn',
]);

export const recruitmentSource = pgEnum('recruitment_source', [
  'walk_in', 'referral', 'agency', 'job_board', 'social_media',
  'provincial', 'training_school', 'other',
]);

export const recruitmentDocType = pgEnum('recruitment_doc_type', [
  'nbi_clearance', 'police_pnp_clearance', 'barangay_clearance', 'drug_test',
  'medical_exam', 'neuro_psych', 'training_cert_sbr_rtc', 'sosia_license',
  'ltopf_license', 'resume_biodata', 'other',
]);

export const recruitmentDocStatus = pgEnum('recruitment_doc_status', [
  'pending', 'submitted', 'verified', 'expired',
]);

// ─── Tables ────────────────────────────────────────────────────────────────────

export const applicants = pgTable('recruitment_applicants', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  middleName: text('middle_name'),
  lastName: text('last_name').notNull(),
  dateOfBirth: date('date_of_birth'),
  sssNumber: text('sss_number'),               // stable ID for blacklist/rehire matching (spec §5)
  phone: text('phone'),
  email: text('email'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  province: text('province'),
  source: recruitmentSource('source').notNull().default('walk_in'),
  positionAppliedFor: employmentType('position_applied_for').notNull().default('GUARD'),
  isArmedPost: boolean('is_armed_post').notNull().default(false),
  pipelineStage: recruitmentStage('pipeline_stage').notNull().default('applied'),
  appliedOn: date('applied_on').notNull(),
  // ON DELETE SET NULL: employees are never hard-deleted in production (status-
  // based), so this only matters for test isolation — it stops a deleted
  // employee from being blocked by an applicant's historical back-link.
  hiredEmployeeId: uuid('hired_employee_id').references(() => employees.id, { onDelete: 'set null' }),
  outcomeReason: text('outcome_reason'),       // reject / withdraw reason
  notes: text('notes'),
  // Person-centric identity spine (Slice 3a, Task 3).
  // Nullable now; backfill (Task 4) populates, Task 12 enforces NOT NULL.
  personId: uuid('person_id').references(() => persons.id, { onDelete: 'set null' }),
  // "ID still needed" nudge flag — set/cleared by advanceStage (Task 11).
  // NOT NULL DEFAULT false so the nudge is safe to read at any point.
  idPending: boolean('id_pending').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const applicantDocuments = pgTable('recruitment_applicant_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicantId: uuid('applicant_id').notNull().references(() => applicants.id, { onDelete: 'cascade' }),
  docType: recruitmentDocType('doc_type').notNull(),
  status: recruitmentDocStatus('status').notNull().default('pending'),
  expiresOn: date('expires_on'),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  verifiedOn: date('verified_on'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const blacklist = pgTable('recruitment_blacklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: date('date_of_birth'),
  sssNumber: text('sss_number'),
  reason: text('reason').notNull(),
  sourceEmployeeId: uuid('source_employee_id').references(() => employees.id, { onDelete: 'set null' }),  // if blacklisting flowed from a termination
  addedByUserId: uuid('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(true),
  // Person-centric identity spine (Slice 3a, Task 3).
  // Nullable permanently — blacklist retains its own name/DOB/SSS snapshot for
  // retention; personId is set on confident matches by the backfill/matcher.
  personId: uuid('person_id').references(() => persons.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Applicant = typeof applicants.$inferSelect;
export type NewApplicant = typeof applicants.$inferInsert;
export type ApplicantDocument = typeof applicantDocuments.$inferSelect;
export type BlacklistEntry = typeof blacklist.$inferSelect;
