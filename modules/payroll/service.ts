/**
 * runPayroll — DB-aware payroll orchestrator.
 *
 * Turns DTR entries + employee master data + compliance rates into persisted payslips.
 * Each employee's computation is wrapped in try/catch so a single failure does not abort
 * the entire run (v2 fix C-3). Numeric values are stored as strings per Drizzle's
 * numeric column contract.
 */

import { and, between, count, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { payRuns, payslips, type PayRun, type Payslip } from './schema';
import { computePayrollLine, type PayrollRates } from './compute';
import { employees } from '@/modules/hr/schema';
import { dtrEntries, type DtrEntry } from '@/modules/dtr/schema';
import {
  sssBracketForMonthly,
  philhealthEE,
  pagibigEE,
  wtaxMonthly,
} from '@/modules/compliance/service';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';

// Statuses to EXCLUDE from the payroll run (non-active statuses).
const EXCLUDED_STATUSES = ['applicant', 'terminated'] as const;

// DTR statuses that count as a worked day. Typed against DtrEntry['status']
// so renaming/removing a dtr_status enum value fails compilation here, not silently in payroll.
const WORKED_STATUSES: ReadonlyArray<DtrEntry['status']> = ['worked', 'holiday_worked', 'restday_worked'];

/**
 * Resolve whether this cut is the final cut of the month.
 * Heuristic: period end day >= 28 → final cut.
 */
function resolveIsFinalCut(periodEnd: string, override?: boolean): boolean {
  if (override !== undefined) return override;
  return Number(periodEnd.slice(-2)) >= 28;
}

export async function runPayroll(
  periodStart: string,
  periodEnd: string,
  opts: { isFinalCutOfMonth?: boolean; actorUserId?: string | null } = {},
): Promise<PayRun> {
  const db = getDb();
  const actor = opts.actorUserId ?? null;
  const isFinalCutOfMonth = resolveIsFinalCut(periodEnd, opts.isFinalCutOfMonth);

  // ── Step 1: Upsert pay_run ────────────────────────────────────────────────
  const existingRuns = await db
    .select()
    .from(payRuns)
    .where(and(eq(payRuns.periodStart, periodStart), eq(payRuns.periodEnd, periodEnd)));

  let run: PayRun;

  if (existingRuns.length === 0) {
    // Fresh run: insert a new draft. Resolve workDaysPerMonth from env.
    const workDaysPerMonth = Number(process.env['WORK_DAYS_PER_MONTH'] ?? '26');
    const [inserted] = await db
      .insert(payRuns)
      .values({ periodStart, periodEnd, status: 'draft', workDaysPerMonth })
      .returning();
    if (!inserted) throw new Error('[payroll/runPayroll] insert pay_run returned no row');
    run = inserted;
  } else {
    // Re-run: keep the existing row, but wipe its payslips so we recompute from scratch.
    run = existingRuns[0]!;
    await db.delete(payslips).where(eq(payslips.payRunId, run.id));
  }

  // ── Step 2: Load active employees (exclude applicant + terminated) ────────
  const activeEmployees = await db
    .select()
    .from(employees)
    .where(notInArray(employees.status, [...EXCLUDED_STATUSES]));

  // ── Step 3: Per-employee loop ─────────────────────────────────────────────
  let payslipCount = 0;

  for (const emp of activeEmployees) {
    try {
      // 3a. Load DTR entries for this employee within the period.
      const entries = await db
        .select()
        .from(dtrEntries)
        .where(
          and(
            eq(dtrEntries.employeeId, emp.id),
            between(dtrEntries.date, periodStart, periodEnd),
          ),
        );

      // 3b. Count worked days.
      const daysWorked = entries.filter((e) =>
        (WORKED_STATUSES as readonly string[]).includes(e.status),
      ).length;

      // Slice-1: OT hours not yet captured via UI.
      const otHours = 0;

      const basicSalaryMonthly = Number(emp.basicSalary);
      const workDaysPerMonth = run.workDaysPerMonth;

      // 3c. Build rate closures that call compliance service with asOf = periodEnd.
      const rates: PayrollRates = {
        sssBracketForMonthly: async (m) => {
          const b = await sssBracketForMonthly(m, periodEnd);
          return b
            ? { eeShareRegular: Number(b.eeShareRegular), eeShareWisp: Number(b.eeShareWisp) }
            : { eeShareRegular: 0, eeShareWisp: 0 };
        },
        philhealthEE: async (m) => philhealthEE(m, periodEnd),
        pagibigEE: async (m) => pagibigEE(m, periodEnd),
        wtaxMonthly: async (t, f) => wtaxMonthly(t, f, periodEnd),
      };

      // 3d. Run the pure computation.
      const result = await computePayrollLine({
        basicSalaryMonthly,
        payFrequency: emp.payFrequency,
        workDaysPerMonth,
        daysWorked,
        otHours,
        isFinalCutOfMonth,
        rates,
      });

      // 3e. Persist the payslip. Drizzle numeric columns require string values.
      const [payslip] = await db
        .insert(payslips)
        .values({
          payRunId: run.id,
          employeeId: emp.id,
          daysWorked: String(daysWorked),
          otHours: String(otHours),
          basicSalarySnapshot: emp.basicSalary,  // already a string from Drizzle select
          payFrequencySnapshot: emp.payFrequency,
          grossPay: String(result.grossPay),
          sssEE: String(result.sssEE),
          philhealthEE: String(result.philhealthEE),
          pagibigEE: String(result.pagibigEE),
          birWtax: String(result.birWtax),
          netPay: String(result.netPay),
          breakdown: result.breakdown,
        })
        .returning();

      if (!payslip) throw new Error('[payroll/runPayroll] insert payslip returned no row');

      payslipCount++;

      // 3f. Audit + event for this payslip.
      await audit.record({
        actor,
        action: 'payroll.line.computed',
        target: { kind: 'payslip', id: payslip.id },
        payload: { employeeCode: emp.employeeCode, netPay: result.netPay },
      });
      await events.publish('payslip.generated', {
        payRunId: run.id,
        employeeId: emp.id,
      });
    } catch (err: any) {
      // Per v2 fix C-3: one employee failing does not abort the run.
      await audit.record({
        actor,
        action: 'payroll.line.failed',
        target: { kind: 'employee', id: emp.id },
        payload: { error: err?.message ?? String(err) },
      });
      // Do not rethrow — continue with the next employee.
    }
  }

  // ── Step 4: Finalize the pay_run ─────────────────────────────────────────
  const [updated] = await db
    .update(payRuns)
    .set({ status: 'calculated', calculatedAt: new Date() })
    .where(eq(payRuns.id, run.id))
    .returning();

  if (!updated) throw new Error('[payroll/runPayroll] update pay_run returned no row');
  run = updated;

  await audit.record({
    actor,
    action: 'payroll.run.completed',
    target: { kind: 'pay_run', id: run.id },
    payload: {
      periodStart,
      periodEnd,
      employeeCount: activeEmployees.length,
      payslipCount,
    },
  });
  await events.publish('payroll.run.completed', { payRunId: run.id, periodStart, periodEnd });

  return run;
}

export async function lockPayRun(
  payRunId: string,
  opts: { actorUserId?: string | null } = {},
): Promise<PayRun> {
  const db = getDb();

  // ── Step 1: Look up the pay_run ───────────────────────────────────────────
  const runs = await db.select().from(payRuns).where(eq(payRuns.id, payRunId));
  const run = runs[0];
  if (!run) throw new Error(`Pay run not found: ${payRunId}`);

  // ── Step 2: Guard — already locked ───────────────────────────────────────
  if (run.status === 'locked') {
    throw new Error(
      `This pay run is already locked (locked at ${run.lockedAt?.toISOString() ?? 'unknown'}).`,
    );
  }

  // ── Step 3: Guard — empty run (v2 fix ISSUE-C) ───────────────────────────
  const countRows = await db
    .select({ n: count() })
    .from(payslips)
    .where(eq(payslips.payRunId, payRunId));
  const payslipCount = Number(countRows[0]?.n ?? 0);

  if (payslipCount === 0) {
    throw new Error(
      'This pay run has no payslips. Run the calculation first before locking.',
    );
  }

  // ── Step 4: Lock it ───────────────────────────────────────────────────────
  const [locked] = await db
    .update(payRuns)
    .set({ status: 'locked', lockedAt: new Date() })
    .where(eq(payRuns.id, payRunId))
    .returning();

  if (!locked) throw new Error('[payroll/lockPayRun] update pay_run returned no row');

  // ── Step 5: Audit + event ─────────────────────────────────────────────────
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'payroll.run.locked',
    target: { kind: 'pay_run', id: payRunId },
    payload: { periodStart: locked.periodStart, periodEnd: locked.periodEnd, payslipCount },
  });
  await events.publish('payroll.run.locked', {
    payRunId,
    periodStart: locked.periodStart,
    periodEnd: locked.periodEnd,
  });

  return locked;
}

/**
 * getPayslip — fetch a single payslip by its primary key.
 * Returns null if not found; never throws on a missing row.
 */
export async function getPayslip(id: string): Promise<Payslip | null> {
  const db = getDb();
  const rows = await db.select().from(payslips).where(eq(payslips.id, id));
  return rows[0] ?? null;
}

/**
 * listPayslips — list payslips matching the provided filter.
 *
 * - { payRunId }           → all payslips for that pay run.
 * - { employeeId }         → all payslips for that employee, newest first.
 * - { payRunId, employeeId } → typically 0–1 rows (unique constraint).
 * - {}                     → throws (listing all payslips ever is not a real use case).
 */
export async function listPayslips(filter: {
  payRunId?: string;
  employeeId?: string;
}): Promise<Payslip[]> {
  if (!filter.payRunId && !filter.employeeId) {
    throw new Error(
      'listPayslips requires at least one of payRunId or employeeId',
    );
  }

  const db = getDb();

  // Build the WHERE clause from whichever filter keys are present.
  const conditions = [];
  if (filter.payRunId) conditions.push(eq(payslips.payRunId, filter.payRunId));
  if (filter.employeeId) conditions.push(eq(payslips.employeeId, filter.employeeId));

  const where = conditions.length === 1 ? conditions[0]! : and(...conditions);

  // When querying by employee across pay runs, return most-recent first.
  if (filter.employeeId && !filter.payRunId) {
    return db.select().from(payslips).where(where).orderBy(desc(payslips.createdAt));
  }

  return db.select().from(payslips).where(where);
}

// ─── Read helpers for the UI ─────────────────────────────────────────────────

export async function listPayRuns(): Promise<PayRun[]> {
  return getDb().select().from(payRuns).orderBy(desc(payRuns.periodStart));
}

export async function getPayRun(id: string): Promise<PayRun | null> {
  const rows = await getDb().select().from(payRuns).where(eq(payRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export type PayslipWithEmployee = Payslip & {
  employee: { id: string; employeeCode: string; firstName: string; lastName: string };
};

export async function listPayslipsWithEmployee(payRunId: string): Promise<PayslipWithEmployee[]> {
  const db = getDb();
  const rows = await db
    .select({
      payslip: payslips,
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(payslips)
    .innerJoin(employees, eq(employees.id, payslips.employeeId))
    .where(eq(payslips.payRunId, payRunId))
    .orderBy(employees.lastName, employees.firstName);

  return rows.map((r) => ({
    ...r.payslip,
    employee: {
      id: r.employeeId,
      employeeCode: r.employeeCode,
      firstName: r.firstName,
      lastName: r.lastName,
    },
  }));
}
