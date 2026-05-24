import { and, eq, lte, gte, or, isNull, desc, notInArray, ne, count } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { assignments, type Assignment } from './schema';
import { employees } from '@/modules/hr/schema';
import { detachments, clients } from '@/modules/clients/schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';

export type ActiveAssignmentRow = {
  id: string;
  startDate: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string };
  detachment: { id: string; name: string };
  client: { id: string; name: string };
};

export type AssignableEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
};

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

// ─── listActiveAssignments ───────────────────────────────────────────────────
// Returns currently-active assignments joined with employee + detachment +
// client, in last-name-first-name order. Used by the /assignments page.
export async function listActiveAssignments(asOf: string): Promise<ActiveAssignmentRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: assignments.id,
      startDate: assignments.startDate,
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      detachmentId: detachments.id,
      detachmentName: detachments.name,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(assignments)
    .innerJoin(employees, eq(employees.id, assignments.employeeId))
    .innerJoin(detachments, eq(detachments.id, assignments.detachmentId))
    .innerJoin(clients, eq(clients.id, detachments.clientId))
    .where(
      and(
        lte(assignments.startDate, asOf),
        or(isNull(assignments.endDate), gte(assignments.endDate, asOf)),
      ),
    )
    .orderBy(employees.lastName, employees.firstName);

  return rows.map((r) => ({
    id: r.id,
    startDate: r.startDate,
    employee: {
      id: r.employeeId,
      employeeCode: r.employeeCode,
      firstName: r.firstName,
      lastName: r.lastName,
    },
    detachment: { id: r.detachmentId, name: r.detachmentName },
    client: { id: r.clientId, name: r.clientName },
  }));
}

// ─── listAssignmentsOverlappingPeriod ────────────────────────────────────────
// Returns assignments that overlap [periodStart, periodEnd] *at any point*.
// Used by the DTR page — a guard who started mid-period still needs DTR rows
// for the days they actually worked, so "active on day 1 of the period" is
// the wrong filter; we want any temporal overlap.
//   startDate <= periodEnd  AND  (endDate IS NULL  OR  endDate >= periodStart)
export async function listAssignmentsOverlappingPeriod(
  periodStart: string,
  periodEnd: string,
): Promise<ActiveAssignmentRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: assignments.id,
      startDate: assignments.startDate,
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      detachmentId: detachments.id,
      detachmentName: detachments.name,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(assignments)
    .innerJoin(employees, eq(employees.id, assignments.employeeId))
    .innerJoin(detachments, eq(detachments.id, assignments.detachmentId))
    .innerJoin(clients, eq(clients.id, detachments.clientId))
    .where(
      and(
        lte(assignments.startDate, periodEnd),
        or(isNull(assignments.endDate), gte(assignments.endDate, periodStart)),
      ),
    )
    .orderBy(employees.lastName, employees.firstName);

  return rows.map((r) => ({
    id: r.id,
    startDate: r.startDate,
    employee: {
      id: r.employeeId,
      employeeCode: r.employeeCode,
      firstName: r.firstName,
      lastName: r.lastName,
    },
    detachment: { id: r.detachmentId, name: r.detachmentName },
    client: { id: r.clientId, name: r.clientName },
  }));
}

// ─── listAssignableEmployees ─────────────────────────────────────────────────
// Returns employees who don't currently have an active assignment and aren't
// terminated. These are the candidates the "Assign a guard" form can pick from.
export async function listAssignableEmployees(asOf: string): Promise<AssignableEmployee[]> {
  const db = getDb();

  const assignedIds = db
    .select({ id: assignments.employeeId })
    .from(assignments)
    .where(
      and(
        lte(assignments.startDate, asOf),
        or(isNull(assignments.endDate), gte(assignments.endDate, asOf)),
      ),
    );

  return db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(and(ne(employees.status, 'terminated'), notInArray(employees.id, assignedIds)))
    .orderBy(employees.lastName, employees.firstName);
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

// ─── bulkAssign ───────────────────────────────────────────────────────────────
// Assigns multiple employees to a single detachment on the same start date.
// One bad employee does NOT abort the batch — the caller must inspect `errors`.
// Each success emits assignments.assignment.created (via the existing `assign`).
export type BulkAssignResult = {
  assigned: Assignment[];
  errors: { employeeId: string; reason: string }[];
};

export async function bulkAssign(
  employeeIds: string[],
  detachmentId: string,
  startDate: string,
  actorUserId?: string | null,
): Promise<BulkAssignResult> {
  const assigned: Assignment[] = [];
  const errors: { employeeId: string; reason: string }[] = [];

  for (const employeeId of employeeIds) {
    try {
      const a = await assign({ employeeId, detachmentId, startDate, actorUserId });
      assigned.push(a);
    } catch (err) {
      errors.push({
        employeeId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { assigned, errors };
}

// ─── bulkEndAssignments ───────────────────────────────────────────────────────
// Ends multiple assignments by id. One bad id does NOT abort the batch.
export type BulkEndResult = {
  ended: Assignment[];
  errors: { assignmentId: string; reason: string }[];
};

export async function bulkEndAssignments(
  assignmentIds: string[],
  endDate: string,
  reason: string,
  actorUserId?: string | null,
): Promise<BulkEndResult> {
  const ended: Assignment[] = [];
  const errors: { assignmentId: string; reason: string }[] = [];

  for (const assignmentId of assignmentIds) {
    try {
      const a = await endAssignment(assignmentId, endDate, reason, { actorUserId });
      ended.push(a);
    } catch (err) {
      errors.push({
        assignmentId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ended, errors };
}

// ─── bulkTransfer ─────────────────────────────────────────────────────────────
// Transfers multiple employees to a new detachment on `transferDate`.
// Per-employee atomic: each employee's end+create is wrapped in a single DB
// transaction. A failure for one employee does NOT affect others.
//
// Inside each TX the SQL is inlined directly (not delegated to endAssignment /
// assign) so we stay within the same connection / transaction boundary.
//
// Returns the newly-created assignment (the "to" side) for each success.
export type BulkTransferResult = {
  transferred: Assignment[];
  errors: { employeeId: string; reason: string }[];
};

function subtractOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function bulkTransfer(
  employeeIds: string[],
  toDetachmentId: string,
  transferDate: string,
  actorUserId?: string | null,
): Promise<BulkTransferResult> {
  const transferred: Assignment[] = [];
  const errors: { employeeId: string; reason: string }[] = [];
  const db = getDb();
  const endDateForOld = subtractOneDay(transferDate);

  for (const employeeId of employeeIds) {
    try {
      const newAssignment = await db.transaction(async (tx) => {
        // 1. Find current active assignment for this employee as of transferDate
        const activeRows = await tx
          .select()
          .from(assignments)
          .where(
            and(
              eq(assignments.employeeId, employeeId),
              lte(assignments.startDate, transferDate),
              or(isNull(assignments.endDate), gte(assignments.endDate, transferDate)),
            ),
          )
          .orderBy(desc(assignments.startDate))
          .limit(1);

        const current = activeRows[0];
        if (!current) {
          throw new Error(
            `[assignments/bulkTransfer] employee ${employeeId} has no active assignment on ${transferDate}`,
          );
        }

        // 2. End the current assignment at transferDate - 1 day
        const [oldEnded] = await tx
          .update(assignments)
          .set({ endDate: endDateForOld, endReason: 'Transfer' })
          .where(eq(assignments.id, current.id))
          .returning();
        if (!oldEnded) throw new Error(`[assignments/bulkTransfer] failed to end assignment ${current.id}`);

        // 3. Create the new assignment at transferDate
        const [created] = await tx
          .insert(assignments)
          .values({
            employeeId,
            detachmentId: toDetachmentId,
            startDate: transferDate,
          })
          .returning();
        if (!created) throw new Error('[assignments/bulkTransfer] insert returned no row');

        return created;
      });

      // Audit + events after TX committed
      await audit.record({
        actor: actorUserId ?? null,
        action: 'assignments.assignment.created',
        target: { kind: 'assignment', id: newAssignment.id },
        payload: {
          employeeId: newAssignment.employeeId,
          detachmentId: newAssignment.detachmentId,
          startDate: newAssignment.startDate,
          transferredFrom: toDetachmentId,
        },
      });

      await events.publish('assignments.assignment.created', {
        id: newAssignment.id,
        employeeId: newAssignment.employeeId,
        detachmentId: newAssignment.detachmentId,
      });

      transferred.push(newAssignment);
    } catch (err) {
      errors.push({
        employeeId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { transferred, errors };
}

// ─── updateAssignment ─────────────────────────────────────────────────────────
// Updates mutable fields on an existing assignment.
// Immutable: id, employeeId, detachmentId, createdAt (silently stripped).
// Mutable: startDate, endDate, reason (endReason).
// Emits assignments.assignment.updated.
export type UpdateAssignmentPatch = {
  startDate?: string;
  endDate?: string | null;
  reason?: string | null;
};

export async function updateAssignment(
  id: string,
  patch: UpdateAssignmentPatch,
  actorUserId?: string | null,
): Promise<Assignment> {
  const db = getDb();

  // Build a type-safe update object using only mutable columns.
  // Immutable fields (id, employeeId, detachmentId, createdAt) are never
  // present in UpdateAssignmentPatch so they are silently ignored by design.
  type MutableSet = {
    startDate?: string;
    endDate?: string | null;
    endReason?: string | null;
  };
  const safe: MutableSet = {};
  if (patch.startDate !== undefined) safe.startDate = patch.startDate;
  if (patch.endDate !== undefined) safe.endDate = patch.endDate;
  if (patch.reason !== undefined) safe.endReason = patch.reason;

  if (Object.keys(safe).length === 0) {
    // Nothing to update — fetch and return current row
    const rows = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
    const existing = rows[0];
    if (!existing) throw new Error(`[assignments/updateAssignment] no assignment ${id}`);
    return existing;
  }

  const [updated] = await db
    .update(assignments)
    .set(safe)
    .where(eq(assignments.id, id))
    .returning();
  if (!updated) throw new Error(`[assignments/updateAssignment] no assignment ${id}`);

  await audit.record({
    actor: actorUserId ?? null,
    action: 'assignments.assignment.updated',
    target: { kind: 'assignment', id },
    payload: safe as Record<string, unknown>,
  });

  await events.publish('assignments.assignment.updated', { id, ...(safe as Record<string, unknown>) });

  return updated;
}

// ─── list ─────────────────────────────────────────────────────────────────────
// Paginated list of all assignments (no join). Ordered by startDate desc.
// Default: limit=50, offset=0.
// Returns { rows: Assignment[], total: number }.
export type ListAssignmentsOptions = {
  limit?: number;
  offset?: number;
};

export type ListAssignmentsResult = {
  rows: Assignment[];
  total: number;
};

export async function list(opts: ListAssignmentsOptions = {}): Promise<ListAssignmentsResult> {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(assignments)
      .orderBy(desc(assignments.startDate))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(assignments),
  ]);

  return {
    rows,
    total: countResult[0]?.total ?? 0,
  };
}
