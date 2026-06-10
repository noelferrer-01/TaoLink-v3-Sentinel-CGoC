import { pgTable, uuid, text, varchar, numeric, date, boolean, pgEnum, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { persons } from '@/modules/persons/schema';

export const employeeStatus = pgEnum('hr_employee_status', [
  'applicant', 'hired', 'deployed', 'reliever', 'floating', 'on_leave', 'terminated',
]);

// Mirror v2 (ref/compliance/migrations/0000_short_loners.sql:33-34): basic_salary +
// pay_frequency. Daily rate is derived, not stored.
export const payFrequency = pgEnum('hr_pay_frequency', ['MONTHLY', 'SEMI_MONTHLY']);

export const employmentType = pgEnum('hr_employment_type', [
  'GUARD',
  'OFFICE_STAFF',
  'SUPERVISOR',
  'DRIVER',
  'JANITOR',
  'OTHER',
]);

// Role record ONLY (ADR 0017 / Slice 3a Task 12): all personal identity —
// name, contact, DOB, statutory IDs, address — lives on the linked Person
// (modules/persons). The duplicated identity columns were renamed to legacy_*
// by migration 0024 and physically dropped by 0025 (T12b) — persons is the
// only identity store. Identity reads go through
// `getEmployeeWithIdentity`; identity edits go through `persons.updatePerson`.
export const employees = pgTable('hr_employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeCode: text('employee_code').notNull(), // CGoC-facing ID, e.g. "CG-00001"
  basicSalary: numeric('basic_salary', { precision: 12, scale: 2 }).notNull(),
  payFrequency: payFrequency('pay_frequency').notNull().default('SEMI_MONTHLY'),
  employmentType: employmentType('employment_type').notNull().default('GUARD'),
  status: employeeStatus('status').notNull().default('hired'),
  hiredOn: date('hired_on').notNull(),
  terminatedOn: date('terminated_on'),
  // BIR compliance field owned by the employee ROLE (not personal identity) —
  // stays here per the T8 design decision. Nullable; export warns when missing.
  rdoCode: varchar('rdo_code', { length: 3 }),         // Revenue District Office, e.g. '044'
  // Person-centric identity spine. NOT NULL + RESTRICT since 0024: every
  // employee row must point at a Person, and a referenced Person can't be deleted.
  personId: uuid('person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  // Armed-post profile: used by Slice 3b readiness radar to determine which
  // credentials are required. Nullable; backfilled from detachment post type
  // in Task 4 and usable once populated.
  isArmedPost: boolean('is_armed_post'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  empCodeUq: unique('hr_employees_code_uq').on(t.employeeCode),
  statusIdx: index('hr_employees_status_idx').on(t.status),
  // FK/join hot path (employee ⋈ person) — Postgres doesn't auto-index FKs.
  personIdIdx: index('hr_employees_person_id_idx').on(t.personId),
}));

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
