import { and, between, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { dtrEntries, dtrPeriodCloses, type DtrEntry, WORKED_DTR_STATUSES } from './schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { getActiveAssignment } from '@/modules/assignments/service';
import { resolveForPeriod } from '@/modules/payroll-calendars/service';
import { assignments } from '@/modules/assignments/schema';
import { detachments } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';
import { persons } from '@/modules/persons/schema';

// Sentinel UUID for global-default calendar lookup (no per-client scope).
// closePeriod is period-wide; late-warning uses the global-default calendar.
const GLOBAL_CALENDAR_SENTINEL = '00000000-0000-0000-0000-000000000000';

export async function recordDTR(input: {
  employeeId: string;
  date: string;
  timeIn?: string;
  timeOut?: string;
  status?: DtrEntry['status'];
  notes?: string;
  actorUserId?: string | null;
}): Promise<DtrEntry> {
  const db = getDb();
  const active = await getActiveAssignment(input.employeeId, input.date);
  try {
    const [created] = await db
      .insert(dtrEntries)
      .values({
        employeeId: input.employeeId,
        assignmentId: active?.id ?? null,
        date: input.date,
        timeIn: input.timeIn ?? null,
        timeOut: input.timeOut ?? null,
        status: input.status ?? 'worked',
        notes: input.notes ?? null,
      })
      .returning();
    if (!created) throw new Error('[dtr/recordDTR] insert returned no row');
    await audit.record({
      actor: input.actorUserId ?? null,
      action: 'dtr.recorded',
      target: { kind: 'dtr_entry', id: created.id },
      payload: { employeeId: input.employeeId, date: input.date },
    });
    await events.publish('dtr.recorded', {
      id: created.id,
      employeeId: input.employeeId,
      date: input.date,
    });
    return created;
  } catch (e: any) {
    if (e.code === '23505')
      throw new Error(
        `A DTR entry already exists for this guard on ${input.date}. Edit the existing entry instead of adding a new one.`,
      );
    if (e.message?.startsWith('[dtr/')) throw e;
    throw new Error(`[dtr/recordDTR] ${e.message ?? e}`);
  }
}

export async function getDTR(
  employeeId: string,
  start: string,
  end: string,
): Promise<DtrEntry[]> {
  return getDb()
    .select()
    .from(dtrEntries)
    .where(
      and(
        eq(dtrEntries.employeeId, employeeId),
        between(dtrEntries.date, start, end),
      ),
    );
}

// ─── Period helpers ──────────────────────────────────────────────────────────

export async function isPeriodClosed(start: string, end: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: dtrPeriodCloses.id })
    .from(dtrPeriodCloses)
    .where(
      and(
        eq(dtrPeriodCloses.periodStart, start),
        eq(dtrPeriodCloses.periodEnd, end),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export type PeriodSummary = { employeeId: string; recordedDays: number };

// Returns one row per employee with the count of days they have DTR entries
// for in [start, end]. Used by the /dtr page to show "X / N days recorded".
export async function summarizePeriod(
  employeeIds: string[],
  start: string,
  end: string,
): Promise<PeriodSummary[]> {
  if (employeeIds.length === 0) return [];
  const rows = await getDb()
    .select({
      employeeId: dtrEntries.employeeId,
      recordedDays: sql<number>`COUNT(*)::int`,
    })
    .from(dtrEntries)
    .where(
      and(
        inArray(dtrEntries.employeeId, employeeIds),
        between(dtrEntries.date, start, end),
      ),
    )
    .groupBy(dtrEntries.employeeId);
  return rows;
}

// Iterate dates in [start, end] inclusive, returning YYYY-MM-DD strings.
// Caller does day math on plain ISO strings — avoids timezone bugs.
function* eachDayBetween(start: string, end: string): Generator<string> {
  const [s, e] = [new Date(start + 'T00:00:00Z'), new Date(end + 'T00:00:00Z')];
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

// Fills in 'worked' DTR entries for every day in [start, end] that doesn't
// already have one. Used by the "Quick fill" demo button on /dtr.
// Sequential inserts because each insert needs its own active-assignment lookup.
export async function bulkFillWorked(
  employeeId: string,
  start: string,
  end: string,
  opts: { timeIn?: string; timeOut?: string; actorUserId?: string | null } = {},
): Promise<{ recorded: number; skipped: number }> {
  const existing = new Set(
    (await getDTR(employeeId, start, end)).map((r) => r.date),
  );
  let recorded = 0;
  let skipped = 0;
  for (const day of eachDayBetween(start, end)) {
    if (existing.has(day)) {
      skipped++;
      continue;
    }
    await recordDTR({
      employeeId,
      date: day,
      status: 'worked',
      timeIn: opts.timeIn ?? '07:00',
      timeOut: opts.timeOut ?? '15:00',
      actorUserId: opts.actorUserId ?? null,
    });
    recorded++;
  }
  return { recorded, skipped };
}

export async function closePeriod(
  periodStart: string,
  periodEnd: string,
  opts: { actorUserId?: string | null; _nowOverride?: Date } = {},
): Promise<void> {
  const db = getDb();
  try {
    await db.insert(dtrPeriodCloses).values({ periodStart, periodEnd });
  } catch (e: any) {
    if (e.code === '23505')
      throw new Error(
        `This period (${periodStart} to ${periodEnd}) is already closed.`,
      );
    throw new Error(`[dtr/closePeriod] ${e.message ?? e}`);
  }
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'dtr.period.closed',
    target: { kind: 'dtr_period', id: `${periodStart}_${periodEnd}` },
    payload: { periodStart, periodEnd },
  });
  await events.publish('dtr.period.closed', { periodStart, periodEnd });

  // ── Late-DTR-close warning ────────────────────────────────────────────────
  // closePeriod is period-wide (no client scope). We resolve the global-default
  // calendar and compare now() to dtrCutoffDate. If the close happens after the
  // cut-off, we emit a warning event + audit record. The close is NOT blocked.
  try {
    const calendar = await resolveForPeriod(
      GLOBAL_CALENDAR_SENTINEL,
      new Date(periodStart + 'T00:00:00Z'),
      new Date(periodEnd + 'T00:00:00Z'),
    );
    const now = opts._nowOverride ?? new Date();
    if (now > calendar.dtrCutoffDate) {
      const periodId = `${periodStart}_${periodEnd}`;
      await audit.record({
        actor: opts.actorUserId ?? null,
        action: 'dtr.period.closed.late',
        target: { kind: 'dtr_period', id: periodId },
        payload: {
          periodStart,
          periodEnd,
          dtrCutoffDate: calendar.dtrCutoffDate.toISOString(),
          closedAt: now.toISOString(),
          calendarSource: calendar.source,
        },
      });
      await events.publish('dtr.period.closed.late', {
        periodStart,
        periodEnd,
        dtrCutoffDate: calendar.dtrCutoffDate.toISOString(),
        closedAt: now.toISOString(),
        calendarSource: calendar.source,
      });
    }
  } catch (warnErr: any) {
    // Late-warning is best-effort; never let it propagate and block the close.
    // A warning in the audit log about the failed check is sufficient.
    await audit.record({
      actor: opts.actorUserId ?? null,
      action: 'dtr.late.warning.failed',
      target: { kind: 'dtr_period', id: `${periodStart}_${periodEnd}` },
      payload: { error: warnErr?.message ?? String(warnErr) },
    }).catch(() => { /* truly swallow — audit itself failing must not crash */ });
  }
}

// ─── Billing readers ─────────────────────────────────────────────────────────

export type BilledDays = {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  detachmentId: string;
  detachmentName: string;
  days: number;
};

// Worked man-days per (employee, detachment) for ONE client in [start, end],
// attributed by the FROZEN dtr_entries.assignment_id. No getActiveAssignment.
export async function billedDaysByEmployeeDetachment(
  clientId: string,
  start: string,
  end: string,
): Promise<BilledDays[]> {
  return getDb()
    .select({
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      firstName: persons.firstName,
      lastName: persons.lastName,
      detachmentId: detachments.id,
      detachmentName: detachments.name,
      days: sql<number>`COUNT(*)::int`,
    })
    .from(dtrEntries)
    .innerJoin(assignments, eq(assignments.id, dtrEntries.assignmentId))
    .innerJoin(detachments, eq(detachments.id, assignments.detachmentId))
    .innerJoin(employees, eq(employees.id, dtrEntries.employeeId))
    .innerJoin(persons, eq(persons.id, employees.personId))
    .where(
      and(
        eq(detachments.clientId, clientId),
        between(dtrEntries.date, start, end),
        inArray(dtrEntries.status, [...WORKED_DTR_STATUSES]),
      ),
    )
    .groupBy(
      employees.id,
      employees.employeeCode,
      persons.firstName,
      persons.lastName,
      detachments.id,
      detachments.name,
    );
}

export type UnattributedDay = {
  dtrEntryId: string;
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  date: string;
};

// Period-level, ALL clients: worked days with NO posting (assignment_id IS NULL).
export async function listUnattributedWorkedDays(
  start: string,
  end: string,
): Promise<UnattributedDay[]> {
  return getDb()
    .select({
      dtrEntryId: dtrEntries.id,
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      firstName: persons.firstName,
      lastName: persons.lastName,
      date: dtrEntries.date,
    })
    .from(dtrEntries)
    .innerJoin(employees, eq(employees.id, dtrEntries.employeeId))
    .innerJoin(persons, eq(persons.id, employees.personId))
    .where(
      and(
        isNull(dtrEntries.assignmentId),
        between(dtrEntries.date, start, end),
        inArray(dtrEntries.status, [...WORKED_DTR_STATUSES]),
      ),
    )
    .orderBy(persons.lastName, persons.firstName, dtrEntries.date);
}

// Re-resolve the active assignment for an existing DTR row's date and stamp it.
export async function reattributeDtrDay(
  dtrEntryId: string,
  opts: { actorUserId?: string | null } = {},
): Promise<DtrEntry> {
  try {
    const db = getDb();
    const [row] = await db.select().from(dtrEntries).where(eq(dtrEntries.id, dtrEntryId)).limit(1);
    if (!row) throw new Error(`[dtr/reattributeDtrDay] no entry ${dtrEntryId}`);
    const active = await getActiveAssignment(row.employeeId, row.date);
    if (!active)
      throw new Error(
        '[dtr/reattributeDtrDay] still no active posting on that date — assign the guard first',
      );
    const [updated] = await db
      .update(dtrEntries)
      .set({ assignmentId: active.id })
      .where(eq(dtrEntries.id, dtrEntryId))
      .returning();
    await audit.record({
      actor: opts.actorUserId ?? null,
      action: 'dtr.reattributed',
      target: { kind: 'dtr_entry', id: dtrEntryId },
      payload: { assignmentId: active.id, date: row.date },
    });
    return updated!;
  } catch (err) {
    // Pass through our own guard errors (their messages are already correct);
    // wrap anything unexpected (DB/audit failure) with the module prefix.
    if (err instanceof Error && err.message.startsWith('[dtr/reattributeDtrDay]')) throw err;
    throw new Error(
      `[dtr/reattributeDtrDay] ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
