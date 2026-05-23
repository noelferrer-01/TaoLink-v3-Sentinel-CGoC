import { getDb } from '@/core/db';
import { auditLog } from './schema';

export type AuditRecordArgs = {
  actor: string | null;
  action: string;
  target?: { kind: string; id: string } | null;
  payload?: Record<string, unknown>;
};

export async function record(args: AuditRecordArgs): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    actorUserId: args.actor,
    action: args.action,
    targetKind: args.target?.kind ?? null,
    targetId: args.target?.id ?? null,
    payload: args.payload ?? {},
  });
}
