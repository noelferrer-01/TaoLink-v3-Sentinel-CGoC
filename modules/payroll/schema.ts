import { pgTable, uuid, date, numeric, pgEnum, timestamp, jsonb, integer, unique, text } from 'drizzle-orm/pg-core';
import { employees } from '@/modules/hr/schema';

export const payRunStatus = pgEnum('pay_run_status', ['draft', 'calculated', 'locked']);

export const payRuns = pgTable('pay_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: payRunStatus('status').notNull().default('draft'),
  workDaysPerMonth: integer('work_days_per_month').notNull().default(26),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
}, (t) => ({ periodUq: unique('pay_runs_period_uq').on(t.periodStart, t.periodEnd) }));

export const payslips = pgTable('payslips', {
  id: uuid('id').primaryKey().defaultRandom(),
  payRunId: uuid('pay_run_id').notNull().references(() => payRuns.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  daysWorked: numeric('days_worked', { precision: 6, scale: 2 }).notNull(),
  otHours: numeric('ot_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  basicSalarySnapshot: numeric('basic_salary_snapshot', { precision: 12, scale: 2 }).notNull(),
  payFrequencySnapshot: text('pay_frequency_snapshot').notNull(),
  grossPay: numeric('gross_pay', { precision: 12, scale: 2 }).notNull(),
  sssEE: numeric('sss_ee', { precision: 12, scale: 2 }).notNull(),
  philhealthEE: numeric('philhealth_ee', { precision: 12, scale: 2 }).notNull(),
  pagibigEE: numeric('pagibig_ee', { precision: 12, scale: 2 }).notNull(),
  birWtax: numeric('bir_wtax', { precision: 12, scale: 2 }).notNull(),
  netPay: numeric('net_pay', { precision: 12, scale: 2 }).notNull(),
  breakdown: jsonb('breakdown').notNull(),  // step-by-step computation log for audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  runEmpUq: unique('payslips_run_emp_uq').on(t.payRunId, t.employeeId),
}));

export type PayRun = typeof payRuns.$inferSelect;
export type NewPayRun = typeof payRuns.$inferInsert;
export type Payslip = typeof payslips.$inferSelect;
export type NewPayslip = typeof payslips.$inferInsert;
