import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { getDb, closeDb } from '@/core/db';
import { events, _resetEventsForTests } from './index';
import { eventLog } from './schema';

const TEST_TOPIC = 'test.events.smoke';

describe('events.publish + subscribe', () => {
  beforeEach(() => {
    _resetEventsForTests();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('persists every publish to event_log', async () => {
    await events.publish(TEST_TOPIC, { n: 1 });
    await events.publish(TEST_TOPIC, { n: 2 });

    const db = getDb();
    const rows = await db
      .select()
      .from(eventLog)
      .where(drizzleSql`${eventLog.topic} = ${TEST_TOPIC}`);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('delivers to in-process subscribers', async () => {
    const received: Record<string, unknown>[] = [];
    const unsub = events.subscribe(TEST_TOPIC, (p) => {
      received.push(p);
    });
    await events.publish(TEST_TOPIC, { hello: 'world' });
    // setImmediate-based delivery — yield once.
    await new Promise((r) => setImmediate(r));
    expect(received).toEqual([{ hello: 'world' }]);
    unsub();
  });

  it('rejects empty topic', async () => {
    await expect(events.publish('', { x: 1 })).rejects.toThrow(/non-empty string/);
  });
});
