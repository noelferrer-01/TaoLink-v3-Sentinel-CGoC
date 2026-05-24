import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  defaultPayrollCalendarId: uuid('default_payroll_calendar_id'),  // FK added by SQL migration
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ nameIdx: index('clients_name_idx').on(t.name) }));

export const detachments = pgTable('detachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  address: text('address'),
  requiredHeadcount: integer('required_headcount'),  // nullable; null = contract not set
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ clientIdx: index('detachments_client_idx').on(t.clientId) }));

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Detachment = typeof detachments.$inferSelect;
export type NewDetachment = typeof detachments.$inferInsert;
