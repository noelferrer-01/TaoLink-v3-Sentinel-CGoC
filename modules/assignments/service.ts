import { and, eq, lte, gte, or, isNull, desc } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { assignments, type Assignment } from './schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';

// ─── getActiveAssignment ─────────────────────────────────────────────────────
// Returns the single most-recently-started assignment where:
//   startDate <= asOf  AND  (endDate IS NULL  OR  endDate >= asOf)
// If overlap prevention is working correctly, at most one open assignment will
// exist at any moment. We use orderBy + limit(1) as a safety net.
export async function getActiveAssignment(
  employeeId: string,
  asOf: string, // YYYY-MM-DD
): Promise<Assignment | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.employeeId, employeeId),
        lte(assignments.startDate, asOf),
        or(isNull(assignments.endDate), gte(assignments.endDate, asOf)),
      ),
    )
    .orderBy(desc(assignments.startDate))
    .limit(1);
  return rows[0] ?? null;
}

// ─── assign ──────────────────────────────────────────────────────────────────
// Creates a new assignment.
//
// Overlap rule: uses getActiveAssignment(employeeId, startDate) to check
// whether any assignment already covers the proposed start date. If yes, it
// rejects. This is conservative: back-to-back assignments where
// new.startDate == old.endDate are also rejected. To chain assignments, end
// the previous one with endDate = (newStart - 1 day) first.
export async function assign(input: {
  employeeId: string;
  detachmentId: string;
  startDate: string; // YYYY-MM-DD
  actorUserId?: string | null;
}): Promise<Assignment> {
  const db = getDb();

  const active = await getActiveAssignment(input.employeeId, input.startDate);
  if (active) {
    throw new Error(
      'this guard already has an active assignment — end the previous one first',
    );
  }

  const [created] = await db
    .insert(assignments)
    .values({
      employeeId: input.employeeId,
      detachmentId: input.detachmentId,
      startDate: input.startDate,
    })
    .returning();
  if (!created) throw new Error('[assignments/assign] insert returned no row');

  await audit.record({
    actor: input.actorUserId ?? null,
    action: 'assignments.assignment.created',
    target: { kind: 'assignment', id: created.id },
    payload: {
      employeeId: created.employeeId,
      detachmentId: created.detachmentId,
      startDate: created.startDate,
    },
  });

  await events.publish('assignments.assignment.created', {
    id: created.id,
    employeeId: created.employeeId,
    detachmentId: created.detachmentId,
  });

  return created;
}

// ─── endAssignment ───────────────────────────────────────────────────────────
// Sets endDate + endReason on an existing assignment. Emits
// assignments.assignment.ended so downstream modules (payroll, recruitment)
// can react without coupling to this module directly.
export async function endAssignment(
  id: string,
  endDate: string, // YYYY-MM-DD
  endReason: string,
  opts: { actorUserId?: string | null } = {},
): Promise<Assignment> {
  const db = getDb();

  const [updated] = await db
    .update(assignments)
    .set({ endDate, endReason })
    .where(eq(assignments.id, id))
    .returning();
  if (!updated) throw new Error(`[assignments/endAssignment] no assignment ${id}`);

  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'assignments.assignment.ended',
    target: { kind: 'assignment', id },
    payload: { endDate, endReason },
  });

  await events.publish('assignments.assignment.ended', { id, endDate, endReason });

  return updated;
}
