import { pgTable, uuid, text, numeric, date, pgEnum, timestamp, unique, index } from 'drizzle-orm/pg-core';

export const employeeStatus = pgEnum('hr_employee_status', [
  'applicant', 'hired', 'deployed', 'reliever', 'floating', 'on_leave', 'terminated',
]);

// Mirror v2 (ref/compliance/migrations/0000_short_loners.sql:33-34): basic_salary +
// pay_frequency. Daily rate is derived, not stored.
export const payFrequency = pgEnum('hr_pay_frequency', ['MONTHLY', 'SEMI_MONTHLY']);

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
  status: employeeStatus('status').notNull().default('hired'),
  hiredOn: date('hired_on').notNull(),
  terminatedOn: date('terminated_on'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  empCodeUq: unique('hr_employees_code_uq').on(t.employeeCode),
  emailUq: unique('hr_employees_email_uq').on(t.email),
  statusIdx: index('hr_employees_status_idx').on(t.status),
}));

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
