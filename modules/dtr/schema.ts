import { pgTable, uuid, date, time, pgEnum, timestamp, unique, index, text } from 'drizzle-orm/pg-core';
import { employees } from '@/modules/hr/schema';
import { assignments } from '@/modules/assignments/schema';

export const dtrStatus = pgEnum('dtr_status', ['worked', 'absent', 'leave', 'holiday_worked', 'restday_worked']);

export const dtrEntries = pgTable('dtr_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  assignmentId: uuid('assignment_id').references(() => assignments.id),
  date: date('date').notNull(),
  timeIn: time('time_in'),
  timeOut: time('time_out'),
  status: dtrStatus('status').notNull().default('worked'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  empDateUq: unique('dtr_emp_date_uq').on(t.employeeId, t.date),
  dateIdx: index('dtr_date_idx').on(t.date),
  assignIdx: index('dtr_assignment_idx').on(t.assignmentId),
}));

export const dtrPeriodCloses = pgTable('dtr_period_closes', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ periodUq: unique('dtr_period_close_uq').on(t.periodStart, t.periodEnd) }));

export type DtrEntry = typeof dtrEntries.$inferSelect;
export type NewDtrEntry = typeof dtrEntries.$inferInsert;
export type DtrPeriodClose = typeof dtrPeriodCloses.$inferSelect;
export type NewDtrPeriodClose = typeof dtrPeriodCloses.$inferInsert;
