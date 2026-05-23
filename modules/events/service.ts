import { EventEmitter } from 'node:events';
import { getDb } from '@/core/db';
import { eventLog } from './schema';

export type EventHandler = (payload: Record<string, unknown>) => void | Promise<void>;

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export async function publish(topic: string, payload: Record<string, unknown>): Promise<void> {
  if (!topic || typeof topic !== 'string') {
    throw new Error('[events] topic must be a non-empty string');
  }
  const db = getDb();
  await db.insert(eventLog).values({ topic, payload });

  // Fire-and-forget in-process delivery. Errors in subscribers don't roll back the publish.
  setImmediate(() => {
    try {
      emitter.emit(topic, payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[events] subscriber threw on topic', topic, err);
    }
  });
}

export function subscribe(topic: string, handler: EventHandler): () => void {
  const wrapped = async (payload: Record<string, unknown>) => {
    try {
      await handler(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[events] handler error on topic', topic, err);
    }
  };
  emitter.on(topic, wrapped);
  return () => {
    emitter.off(topic, wrapped);
  };
}

export function _resetForTests(): void {
  emitter.removeAllListeners();
}
