import { pgTable, text, jsonb, timestamp, uuid, integer } from 'drizzle-orm/pg-core';
import { users } from '@/modules/auth/schema';

export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull().default({}),
  rule: text('rule').notNull(),
  status: text('status').notNull().default('pending'),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const approvalSteps = pgTable('approval_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => approvalRequests.id, { onDelete: 'cascade' }),
  approverId: uuid('approver_id')
    .notNull()
    .references(() => users.id),
  ordinal: integer('ordinal').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const approvalDecisions = pgTable('approval_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => approvalRequests.id, { onDelete: 'cascade' }),
  stepId: uuid('step_id').references(() => approvalSteps.id),
  approverId: uuid('approver_id')
    .notNull()
    .references(() => users.id),
  decision: text('decision').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type ApprovalStep = typeof approvalSteps.$inferSelect;
export type ApprovalDecision = typeof approvalDecisions.$inferSelect;
