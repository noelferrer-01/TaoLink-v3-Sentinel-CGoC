/**
 * Slice 0 regression gate (added in Slice 1 Phase 9.2, per ADR 0013 rule #1).
 *
 * The point of this suite is NOT to re-cover the per-module Slice 0 tests
 * (those still run on every `pnpm test`). The point is to prove the Slice 0
 * primitives — auth login, audit append-only, approvals round-trip, events
 * pub/sub — still hold *after* every Slice 1 module is loaded into the same
 * process. If a Slice 1 import bled state, monkey-patched a primitive, or a
 * later migration accidentally weakened a Slice 0 constraint, this is the
 * single signal that catches it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb, getSql } from '@/core/db';

// Slice 0 modules (the contract under test).
import { auth } from '@/modules/auth';
import { audit } from '@/modules/audit';
import { auditLog } from '@/modules/audit/schema';
import { approvals } from '@/modules/approvals';
import { events, _resetEventsForTests } from '@/modules/events';
import { eventLog } from '@/modules/events/schema';

// Slice 1 modules — imported for side effects: forces them to load so any
// import-time state mutation or subscriber registration happens before we
// re-validate Slice 0. If you ship a new module in a future slice, add it
// here too.
import '@/modules/hr';
import '@/modules/clients';
import '@/modules/assignments';
import '@/modules/dtr';
import '@/modules/payroll';
import '@/modules/compliance-exports';
import '@/modules/compliance';

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const REQUESTER_EMAIL = `regression-slice0-req-${stamp}@sentinel.test`;
const APPROVER_EMAIL = `regression-slice0-app-${stamp}@sentinel.test`;
const AUTH_EMAIL = `regression-slice0-auth-${stamp}@sentinel.test`;
const PASSWORD = 'regression-test-password-1234567890';

let requesterId: string;
let approverId: string;

describe('Slice 0 regression gate (with Slice 1 modules loaded)', () => {
  beforeAll(async () => {
    await auth.createUser({ email: AUTH_EMAIL, password: PASSWORD });
    const requester = await auth.createUser({ email: REQUESTER_EMAIL, password: PASSWORD });
    const approver = await auth.createUser({ email: APPROVER_EMAIL, password: PASSWORD });
    requesterId = requester.id;
    approverId = approver.id;
  });

  beforeEach(() => {
    _resetEventsForTests();
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('auth primitive still works', () => {
    it('logs in with correct credentials and tokenises a session', async () => {
      const res = await auth.login(AUTH_EMAIL, PASSWORD);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.session.token.length).toBeGreaterThan(20);

      const found = await auth.findSessionByToken(res.session.token);
      expect(found?.user.email).toBe(AUTH_EMAIL);

      await auth.logout(res.session.token);
      expect(await auth.findSessionByToken(res.session.token)).toBeNull();
    });

    it('rejects bad credentials', async () => {
      const bad = await auth.login(AUTH_EMAIL, 'wrong-password');
      expect(bad.ok).toBe(false);
    });
  });

  describe('audit primitive — append-only invariant still enforced', () => {
    it('records and reads back', async () => {
      await audit.record({
        actor: null,
        action: `regression.slice0.${stamp}`,
        target: { kind: 'regression', id: stamp },
        payload: { phase: '9.2' },
      });
      const db = getDb();
      const rows = await db
        .select()
        .from(auditLog)
        .where(drizzleSql`${auditLog.action} = ${`regression.slice0.${stamp}`}`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('rejects UPDATE on audit_log', async () => {
      await audit.record({ actor: null, action: `regression.no_update.${stamp}`, payload: {} });
      const sql = getSql();
      await expect(
        sql`UPDATE audit_log SET action = 'mutated' WHERE action = ${`regression.no_update.${stamp}`}`,
      ).rejects.toThrow(/append-only/);
    });

    it('rejects DELETE on audit_log', async () => {
      await audit.record({ actor: null, action: `regression.no_delete.${stamp}`, payload: {} });
      const sql = getSql();
      await expect(
        sql`DELETE FROM audit_log WHERE action = ${`regression.no_delete.${stamp}`}`,
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('events primitive — publish persists, subscribers deliver', () => {
    const TOPIC = `regression.slice0.events.${stamp}`;

    it('persists every publish to event_log', async () => {
      await events.publish(TOPIC, { n: 1 });
      await events.publish(TOPIC, { n: 2 });
      const db = getDb();
      const rows = await db
        .select()
        .from(eventLog)
        .where(drizzleSql`${eventLog.topic} = ${TOPIC}`);
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it('delivers to in-process subscribers', async () => {
      const received: Record<string, unknown>[] = [];
      const unsub = events.subscribe(TOPIC, (p) => {
        received.push(p);
      });
      await events.publish(TOPIC, { hello: 'world' });
      await new Promise((r) => setImmediate(r));
      expect(received).toEqual([{ hello: 'world' }]);
      unsub();
    });
  });

  describe('approvals primitive — request → decide still round-trips', () => {
    it('approves a request and emits the lifecycle events', async () => {
      const req = await approvals.request({
        kind: `regression.slice0.approval.${stamp}`,
        payload: { phase: '9.2' },
        approvers: [approverId],
        requestedBy: requesterId,
      });
      expect(req.status).toBe('pending');

      const decided = await approvals.decide(req.id, approverId, 'approved', 'regression-ok');
      expect(decided.status).toBe('approved');
      expect(decided.resolvedAt).not.toBeNull();

      const db = getDb();
      const evts = await db
        .select()
        .from(eventLog)
        .where(drizzleSql`${eventLog.topic} IN ('approvals.requested', 'approvals.decided')`);
      const topicsForThisReq = evts
        .filter((e) => (e.payload as { requestId?: string }).requestId === req.id)
        .map((e) => e.topic);
      expect(topicsForThisReq).toContain('approvals.requested');
      expect(topicsForThisReq).toContain('approvals.decided');
    });

    it('rejects deciding twice on the same request', async () => {
      const req = await approvals.request({
        kind: `regression.slice0.double_decide.${stamp}`,
        payload: {},
        approvers: [approverId],
        requestedBy: requesterId,
      });
      await approvals.decide(req.id, approverId, 'rejected', 'first');
      await expect(approvals.decide(req.id, approverId, 'approved')).rejects.toThrow(/already/);
    });
  });
});
