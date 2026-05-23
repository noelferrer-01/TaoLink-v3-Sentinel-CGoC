import { pgTable, text, jsonb, timestamp, bigserial, uuid, index } from 'drizzle-orm/pg-core';
import { users } from '@/modules/auth/schema';

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetKind: text('target_kind'),
    targetId: text('target_id'),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    createdAtIdx: index('audit_log_created_at_idx').on(t.createdAt),
    actionIdx: index('audit_log_action_idx').on(t.action),
  }),
);

export type AuditEntry = typeof auditLog.$inferSelect;
export type NewAuditEntry = typeof auditLog.$inferInsert;
