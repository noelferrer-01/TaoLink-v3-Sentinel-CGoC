import { pgTable, uuid, date, timestamp, text, index } from 'drizzle-orm/pg-core';
import { employees } from '@/modules/hr/schema';
import { detachments } from '@/modules/clients/schema';

export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  detachmentId: uuid('detachment_id').notNull().references(() => detachments.id, { onDelete: 'restrict' }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  endReason: text('end_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  empDateIdx: index('assignments_emp_date_idx').on(t.employeeId, t.startDate),
  detIdx: index('assignments_det_idx').on(t.detachmentId),
}));

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
