import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { getDb, getSql, closeDb } from '@/core/db';
import { audit } from './index';
import { auditLog } from './schema';

describe('audit.record + immutability', () => {
  afterAll(async () => {
    // audit_log is intentionally append-only at the DB layer; we don't clean
    // up test rows. CI wipes the DB between runs; local cruft is harmless.
    await closeDb();
  });

  it('inserts a row visible by SELECT', async () => {
    await audit.record({
      actor: null,
      action: 'test.audit_insert',
      target: { kind: 'thing', id: 'abc' },
      payload: { hello: 'world' },
    });

    const db = getDb();
    const rows = await db
      .select()
      .from(auditLog)
      .where(drizzleSql`${auditLog.action} = 'test.audit_insert'`);
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.at(-1)!;
    expect(row.action).toBe('test.audit_insert');
    expect(row.targetKind).toBe('thing');
    expect(row.targetId).toBe('abc');
    expect(row.payload).toEqual({ hello: 'world' });
  });

  it('rejects UPDATE on audit_log', async () => {
    await audit.record({ actor: null, action: 'test.audit_no_update', payload: {} });
    const sql = getSql();
    await expect(
      sql`UPDATE audit_log SET action = 'mutated' WHERE action = 'test.audit_no_update'`,
    ).rejects.toThrow(/append-only/);
  });

  it('rejects DELETE on audit_log', async () => {
    await audit.record({ actor: null, action: 'test.audit_no_delete', payload: {} });
    const sql = getSql();
    await expect(
      sql`DELETE FROM audit_log WHERE action = 'test.audit_no_delete'`,
    ).rejects.toThrow(/append-only/);
  });
});
