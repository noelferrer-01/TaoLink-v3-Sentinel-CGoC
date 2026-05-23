import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { approvals } from './index';
import { auth } from '@/modules/auth';
import { eventLog } from '@/modules/events/schema';

let requesterId: string;
let approverId: string;

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const REQUESTER_EMAIL = `test-approvals-requester-${stamp}@sentinel.test`;
const APPROVER_EMAIL = `test-approvals-approver-${stamp}@sentinel.test`;

describe('approvals (single rule)', () => {
  beforeAll(async () => {
    const requester = await auth.createUser({
      email: REQUESTER_EMAIL,
      password: 'temp-pw-not-used-1234567890',
    });
    const approver = await auth.createUser({
      email: APPROVER_EMAIL,
      password: 'temp-pw-not-used-1234567890',
    });
    requesterId = requester.id;
    approverId = approver.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('request → decide(approved) round-trips and emits events', async () => {
    const req = await approvals.request({
      kind: 'test.payroll_run',
      payload: { period: '2026-05' },
      approvers: [approverId],
      requestedBy: requesterId,
    });
    expect(req.status).toBe('pending');

    const updated = await approvals.decide(req.id, approverId, 'approved', 'looks good');
    expect(updated.status).toBe('approved');
    expect(updated.resolvedAt).not.toBeNull();

    const db = getDb();
    const evts = await db
      .select()
      .from(eventLog)
      .where(drizzleSql`${eventLog.topic} IN ('approvals.requested', 'approvals.decided')`);
    const relevantTopics = evts
      .filter((e) => (e.payload as { requestId?: string }).requestId === req.id)
      .map((e) => e.topic);
    expect(relevantTopics).toContain('approvals.requested');
    expect(relevantTopics).toContain('approvals.decided');
  });

  it('rejects deciding twice on the same request', async () => {
    const req = await approvals.request({
      kind: 'test.double_decide',
      payload: {},
      approvers: [approverId],
      requestedBy: requesterId,
    });
    await approvals.decide(req.id, approverId, 'rejected', 'no');
    await expect(approvals.decide(req.id, approverId, 'approved')).rejects.toThrow(/already/);
  });

  it('rejects an approver not on the request', async () => {
    const req = await approvals.request({
      kind: 'test.wrong_approver',
      payload: {},
      approvers: [approverId],
      requestedBy: requesterId,
    });
    await expect(approvals.decide(req.id, requesterId, 'approved')).rejects.toThrow(/not an approver/);
  });

  it('rejects empty approver list', async () => {
    await expect(
      approvals.request({
        kind: 'test.empty',
        payload: {},
        approvers: [],
        requestedBy: requesterId,
      }),
    ).rejects.toThrow(/at least one approver/);
  });

  it('reads status', async () => {
    const req = await approvals.request({
      kind: 'test.status',
      payload: {},
      approvers: [approverId],
      requestedBy: requesterId,
    });
    const s = await approvals.status(req.id);
    expect(s?.status).toBe('pending');
  });
});
