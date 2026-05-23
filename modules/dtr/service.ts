import { and, between, eq } from 'drizzle-orm';
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
