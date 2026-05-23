import { pgTable, text, jsonb, timestamp, bigserial, index } from 'drizzle-orm/pg-core';

export const eventLog = pgTable(
  'event_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull().default({}),
    publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    topicIdx: index('event_log_topic_idx').on(t.topic),
    publishedAtIdx: index('event_log_published_at_idx').on(t.publishedAt),
  }),
);

export type EventEntry = typeof eventLog.$inferSelect;
export type NewEventEntry = typeof eventLog.$inferInsert;
