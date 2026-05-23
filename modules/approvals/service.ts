import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import {
  approvalRequests,
  approvalSteps,
  approvalDecisions,
  type ApprovalRequest,
} from './schema';

export type ApprovalRule = 'single' | 'all_of' | 'any_of';
export type ApprovalDecisionValue = 'approved' | 'rejected';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type RequestApprovalArgs = {
  kind: string;
  payload: Record<string, unknown>;
  approvers: string[];
  rule?: ApprovalRule;
  requestedBy: string | null;
};

export async function request(args: RequestApprovalArgs): Promise<ApprovalRequest> {
  if (args.approvers.length === 0) {
    throw new Error('[approvals] at least one approver is required');
  }
  const rule = args.rule ?? 'single';
  if (rule !== 'single' && rule !== 'all_of' && rule !== 'any_of') {
    throw new Error(`[approvals] unknown rule "${rule}"`);
  }
  if (rule !== 'single' && args.approvers.length === 1) {
    // single approver with multi-rule is just 'single'
  }
  if ((rule === 'all_of' || rule === 'any_of') && process.env.NODE_ENV !== 'test') {
    // schema supports multi; engine deferred — see wiki/slices/0-foundation.md
    throw new Error(
      `[approvals] rule "${rule}" not yet supported by the engine. Use "single" until a slice needs multi-approver.`,
    );
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [req] = await tx
      .insert(approvalRequests)
      .values({
        kind: args.kind,
        payload: args.payload,
        rule,
        requestedBy: args.requestedBy,
      })
      .returning();
    if (!req) throw new Error('[approvals] failed to create request');

    await tx.insert(approvalSteps).values(
      args.approvers.map((approverId, idx) => ({
        requestId: req.id,
        approverId,
        ordinal: idx,
      })),
    );

    await audit.record({
      actor: args.requestedBy,
      action: 'approvals.requested',
      target: { kind: 'approval_request', id: req.id },
      payload: { kind: args.kind, rule, approvers: args.approvers },
    });
    await events.publish('approvals.requested', {
      requestId: req.id,
      kind: args.kind,
      rule,
      approvers: args.approvers,
      requestedBy: args.requestedBy,
    });

    return req;
  });
}

export async function decide(
  requestId: string,
  approverId: string,
  decision: ApprovalDecisionValue,
  reason?: string,
): Promise<ApprovalRequest> {
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new Error(`[approvals] unknown decision "${decision}"`);
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId))
      .limit(1);
    if (!req) throw new Error(`[approvals] no such request ${requestId}`);
    if (req.status !== 'pending') {
      throw new Error(`[approvals] request ${requestId} is already ${req.status}`);
    }

    // Confirm the approver is on the request
    const steps = await tx
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.requestId, requestId));
    const step = steps.find((s) => s.approverId === approverId);
    if (!step) {
      throw new Error(`[approvals] user ${approverId} is not an approver on ${requestId}`);
    }

    await tx.insert(approvalDecisions).values({
      requestId,
      stepId: step.id,
      approverId,
      decision,
      reason: reason ?? null,
    });

    // Slice 0 supports only 'single' — one decision finalises the request
    const newStatus: ApprovalStatus = decision === 'approved' ? 'approved' : 'rejected';
    const [updated] = await tx
      .update(approvalRequests)
      .set({ status: newStatus, resolvedAt: new Date() })
      .where(eq(approvalRequests.id, requestId))
      .returning();
    if (!updated) throw new Error('[approvals] failed to update request');

    await audit.record({
      actor: approverId,
      action: 'approvals.decided',
      target: { kind: 'approval_request', id: requestId },
      payload: { decision, reason: reason ?? null },
    });
    await events.publish('approvals.decided', {
      requestId,
      decision,
      reason: reason ?? null,
      approverId,
      status: newStatus,
    });

    return updated;
  });
}

export async function status(requestId: string): Promise<ApprovalRequest | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, requestId))
    .limit(1);
  return row ?? null;
}
