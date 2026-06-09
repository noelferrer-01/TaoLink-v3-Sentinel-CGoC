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

export const employees = pgTable('hr_employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeCode: text('employee_code').notNull(), // CGoC-facing ID, e.g. "CG-00001"
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  middleName: text('middle_name'),
  email: text('email'),
  phone: text('phone'),
  basicSalary: numeric('basic_salary', { precision: 12, scale: 2 }).notNull(),
  payFrequency: payFrequency('pay_frequency').notNull().default('SEMI_MONTHLY'),
  employmentType: employmentType('employment_type').notNull().default('GUARD'),
  status: employeeStatus('status').notNull().default('hired'),
  hiredOn: date('hired_on').notNull(),
  terminatedOn: date('terminated_on'),
  // Statutory IDs — nullable; populated when on file. Compliance exports treat
  // a missing value as a per-employee warning, not an export-blocking error.
  sssNumber: text('sss_number'),
  philhealthNumber: text('philhealth_number'),
  pagibigNumber: text('pagibig_number'),
  tinNumber: text('tin_number'),
  // BIR 2316 fields — nullable; populated on file. Phase 7 PDF export warns on
  // missing values rather than blocking the export.
  rdoCode: varchar('rdo_code', { length: 3 }),         // Revenue District Office, e.g. '044'
  dateOfBirth: date('date_of_birth'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  province: text('province'),
  postalCode: varchar('postal_code', { length: 4 }),
  // Person-centric identity spine (Slice 3a, Task 3).
  // Nullable now; backfill (Task 4) populates, Task 12 enforces NOT NULL.
  personId: uuid('person_id').references(() => persons.id, { onDelete: 'set null' }),
  // Armed-post profile: used by Slice 3b readiness radar to determine which
  // credentials are required. Nullable now; backfilled from detachment post type
  // in Task 4 and usable once populated.
  isArmedPost: boolean('is_armed_post'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  empCodeUq: unique('hr_employees_code_uq').on(t.employeeCode),
  emailUq: unique('hr_employees_email_uq').on(t.email),
  statusIdx: index('hr_employees_status_idx').on(t.status),
}));

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
