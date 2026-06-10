import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { clients } from '../clients/schema';

export const payrollFrequency = pgEnum('payroll_frequency', ['WEEKLY', 'SEMI_MONTHLY', 'MONTHLY']);

export const payrollCalendars = pgTable('payroll_calendars', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id),  // nullable → global default
  name: text('name').notNull(),
  frequency: payrollFrequency('frequency').notNull().default('SEMI_MONTHLY'),
  dtrCutoffDaysAfterPeriodEnd: integer('dtr_cutoff_days_after_period_end').notNull().default(2),
  paydayDaysAfterPeriodEnd: integer('payday_days_after_period_end').notNull().default(5),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
