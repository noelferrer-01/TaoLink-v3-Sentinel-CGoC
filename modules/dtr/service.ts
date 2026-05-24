import { and, between, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { dtrEntries, dtrPeriodCloses, type DtrEntry } from './schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { getActiveAssignment } from '@/modules/assignments/service';

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
  opts: { actorUserId?: string | null } = {},
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
}
