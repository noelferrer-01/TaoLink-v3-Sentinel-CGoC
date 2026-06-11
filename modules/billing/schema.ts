import {
  pgTable, uuid, text, integer, boolean, numeric, date,
  timestamp, pgEnum, unique, index,
} from 'drizzle-orm/pg-core';
import { clients, detachments } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';

export const billingInvoiceStatus = pgEnum('billing_invoice_status', ['draft', 'finalized', 'paid']);

export const clientBillingConfig = pgTable('client_billing_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }).unique(),
  ratePerManday: numeric('rate_per_manday', { precision: 12, scale: 2 }).notNull(),
  paymentTermsDays: integer('payment_terms_days').notNull().default(15),
  chargesVat: boolean('charges_vat').notNull().default(true),
  clientWithholdsEwt: boolean('client_withholds_ewt').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const billingInvoices = pgTable('billing_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  soaNumber: text('soa_number').unique(),            // null until finalized
  status: billingInvoiceStatus('status').notNull().default('draft'),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  vatAmount: numeric('vat_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  ewtAmount: numeric('ewt_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  totalDue: numeric('total_due', { precision: 12, scale: 2 }).notNull().default('0'),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientPeriodUq: unique('billing_invoice_client_period_uq').on(t.clientId, t.periodStart, t.periodEnd),
  clientIdx: index('billing_invoice_client_idx').on(t.clientId),
}));

export const billingInvoiceLines = pgTable('billing_invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => billingInvoices.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  employeeCodeSnapshot: text('employee_code_snapshot').notNull(),
  employeeNameSnapshot: text('employee_name_snapshot').notNull(),
  detachmentId: uuid('detachment_id').notNull().references(() => detachments.id, { onDelete: 'restrict' }),
  detachmentNameSnapshot: text('detachment_name_snapshot').notNull(),
  daysWorked: integer('days_worked').notNull(),
  ratePerManday: numeric('rate_per_manday', { precision: 12, scale: 2 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
}, (t) => ({ invoiceIdx: index('billing_invoice_line_invoice_idx').on(t.invoiceId) }));

// Gapless, concurrency-safe SOA numbering (one counter row per year, locked on increment).
export const billingSoaCounters = pgTable('billing_soa_counters', {
  year: integer('year').primaryKey(),
  nextValue: integer('next_value').notNull().default(1),
});

export type BillingInvoice = typeof billingInvoices.$inferSelect;
export type BillingInvoiceLine = typeof billingInvoiceLines.$inferSelect;
export type ClientBillingConfig = typeof clientBillingConfig.$inferSelect;
