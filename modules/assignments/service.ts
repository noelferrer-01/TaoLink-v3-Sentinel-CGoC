import { and, eq, lte, gte, or, isNull, desc, notInArray, ne } from 'drizzle-orm';
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
