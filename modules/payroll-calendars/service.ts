import { eq, isNull } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { audit } from '@/modules/audit';
import { payrollCalendars } from './schema';

export type PayrollCalendar = typeof payrollCalendars.$inferSelect;
export type NewPayrollCalendar = typeof payrollCalendars.$inferInsert;

export async function create(
  input: NewPayrollCalendar & { actorUserId?: string | null },
): Promise<PayrollCalendar> {
  const db = getDb();
  const { actorUserId, ...row } = input as NewPayrollCalendar & { actorUserId?: string | null };
  const [created] = await db.insert(payrollCalendars).values(row).returning();
  if (!created) throw new Error('[payroll-calendars/create] insert returned no row');
  await audit.record({
    actor: actorUserId ?? null,
    action: 'payroll-calendars.calendar.created',
    target: { kind: 'payroll_calendar', id: created.id },
    payload: { name: created.name, clientId: created.clientId },
  });
  return created;
}

export async function update(
  id: string,
  patch: Partial<NewPayrollCalendar>,
  opts: { actorUserId?: string | null } = {},
): Promise<PayrollCalendar> {
  const db = getDb();
  const [row] = await db
    .update(payrollCalendars)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(payrollCalendars.id, id))
    .returning();
  if (!row) throw new Error(`payroll-calendars: calendar ${id} not found`);
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'payroll-calendars.calendar.updated',
    target: { kind: 'payroll_calendar', id },
    payload: { diff: Object.keys(patch) },
  });
  return row;
}

export async function getForClient(clientId: string): Promise<PayrollCalendar | null> {
  const db = getDb();
  const [byClient] = await db
    .select()
    .from(payrollCalendars)
    .where(eq(payrollCalendars.clientId, clientId));
  if (byClient) return byClient;
  const [globalDefault] = await db
    .select()
    .from(payrollCalendars)
    .where(isNull(payrollCalendars.clientId));
  return globalDefault ?? null;
}

export interface ResolvedCalendar {
  dtrCutoffDate: Date;
  paydayDate: Date;
  source: 'client' | 'global-default' | 'fallback-defaults';
}

const FALLBACK_DTR_CUTOFF_DAYS = 2;
const FALLBACK_PAYDAY_DAYS = 5;

export async function resolveForPeriod(
  clientId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ResolvedCalendar> {
  const cal = await getForClient(clientId);
  const cutoffDays = cal?.dtrCutoffDaysAfterPeriodEnd ?? FALLBACK_DTR_CUTOFF_DAYS;
  const paydayDays = cal?.paydayDaysAfterPeriodEnd ?? FALLBACK_PAYDAY_DAYS;
  const source: ResolvedCalendar['source'] =
    cal ? (cal.clientId ? 'client' : 'global-default') : 'fallback-defaults';
  return {
    dtrCutoffDate: addDays(periodEnd, cutoffDays),
    paydayDate: addDays(periodEnd, paydayDays),
    source,
  };
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
