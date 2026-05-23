/**
 * payroll.test.ts — integration tests for runPayroll against real Postgres.
 *
 * Cleanup order respects FK constraints:
 *   payslips → pay_runs → dtr_entries → dtr_period_closes →
 *   assignments → detachments → clients → employees
 *
 * audit_log is append-only (DB-level immutability trigger blocks DELETE).
 * We capture a timestamp before each test and filter audit_log assertions
 * by createdAt >= testStart so prior-test rows don't pollute assertions.
 *
 * event_log has no immutability trigger and IS wiped in beforeEach.
 *
 * Compliance tables are intentionally NOT wiped; we call seedComplianceRates
 * once in beforeAll. The seed function is idempotent (clears by effectiveDate
 * before re-inserting), so running the suite multiple times is safe.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { and, eq, gte } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { payRuns, payslips } from './schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { detachments, clients } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';
import { auditLog } from '@/modules/audit/schema';
import { eventLog } from '@/modules/events/schema';
import { hr } from '@/modules/hr/index';
import { seedComplianceRates } from '@/modules/compliance/seed';
import { runPayroll, lockPayRun, getPayslip, listPayslips, initPayrollSubscriptions, _resetPayrollSubscriptionsForTests } from './index';
import { dtr } from '@/modules/dtr/index';
import { events, _resetEventsForTests } from '@/modules/events/index';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

async function makeEmployee(
  code: string,
  opts: { salary?: number; status?: string; payFrequency?: 'MONTHLY' | 'SEMI_MONTHLY' } = {},
) {
  const db = getDb();
  const emp = await hr.createEmployee({
    employeeCode: code,
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    basicSalary: opts.salary ?? 18000,
    hiredOn: '2026-05-01',
    payFrequency: opts.payFrequency ?? 'SEMI_MONTHLY',
  });

  // If we need a non-default status, update directly (hr service has transition guards).
  if (opts.status && opts.status !== 'hired') {
    await db
      .update(employees)
      .set({ status: opts.status as any })
      .where(eq(employees.id, emp.id));
    return { ...emp, status: opts.status as any };
  }
  return emp;
}

async function makeDtrEntries(
  employeeId: string,
  dates: string[],
  status: 'worked' | 'absent' | 'leave' | 'holiday_worked' | 'restday_worked' = 'worked',
) {
  const db = getDb();
  if (dates.length === 0) return;
  await db.insert(dtrEntries).values(
    dates.map((date) => ({ employeeId, date, status })),
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('payroll module — runPayroll', () => {
  const db = getDb();

  // Timestamp captured at the start of each test for filtering audit_log.
  let testStart: Date;

  beforeAll(async () => {
    // Seed compliance rates once for the whole suite (idempotent).
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });

  beforeEach(async () => {
    testStart = new Date();

    // FK-ordered wipe. Compliance tables are intentionally excluded.
    // audit_log is intentionally excluded (append-only DB trigger blocks DELETE).
    await db.delete(payslips);
    await db.delete(payRuns);
    await db.delete(dtrEntries);
    await db.delete(dtrPeriodCloses);
    await db.delete(assignmentsTable);
    await db.delete(detachments);
    await db.delete(clients);
    await db.delete(employees);
    // event_log has no immutability trigger — safe to wipe.
    await db.delete(eventLog);
  });

  // ─── Test 1: Happy path ───────────────────────────────────────────────────
  it('happy path: 1 employee (₱18k SEMI_MONTHLY) × 13 worked days → correct payslip', async () => {
    const emp = await makeEmployee('CG-P001');

    // 13 worked days across May 16–31
    const workDays = [
      '2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19', '2026-05-20',
      '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-25', '2026-05-26',
      '2026-05-27', '2026-05-28', '2026-05-29',
    ];
    await makeDtrEntries(emp.id, workDays);

    const run = await runPayroll('2026-05-16', '2026-05-31');

    // PayRun assertions
    expect(run.status).toBe('calculated');
    expect(run.periodStart).toBe('2026-05-16');
    expect(run.periodEnd).toBe('2026-05-31');

    // Payslip assertions
    const slips = await db
      .select()
      .from(payslips)
      .where(and(eq(payslips.payRunId, run.id), eq(payslips.employeeId, emp.id)));

    expect(slips).toHaveLength(1);
    const slip = slips[0]!;

    expect(Number(slip.daysWorked)).toBe(13);
    // grossPay = 18000/26 * 13 = 9000 exactly
    expect(Number(slip.grossPay)).toBeCloseTo(9000, 2);
    // Final cut (May 31 >= 28): full statutory applied
    // SSS at MSC 18000 (no WISP since 18000 < 20000): eeRegular=900, eeWisp=0 → sssEE=900
    expect(Number(slip.sssEE)).toBeCloseTo(900, 2);
    // PhilHealth: min(max(18000,10000),100000)*0.05/2 = 450
    expect(Number(slip.philhealthEE)).toBeCloseTo(450, 2);
    // Pag-IBIG: min(18000,10000)*0.02 = 200
    expect(Number(slip.pagibigEE)).toBeCloseTo(200, 2);
    // WTAX SEMI_MONTHLY: taxable = 9000-900-450-200 = 7450 < 10417 → 0
    expect(Number(slip.birWtax)).toBe(0);
    // Net = 9000 - 900 - 450 - 200 = 7450
    expect(Number(slip.netPay)).toBeCloseTo(7450, 2);

    // audit_log: filter by createdAt >= testStart (append-only, can't wipe)
    const auditRows = await db
      .select()
      .from(auditLog)
      .where(gte(auditLog.createdAt, testStart));
    const actions = auditRows.map((r) => r.action);
    expect(actions).toContain('payroll.line.computed');
    expect(actions).toContain('payroll.run.completed');

    // event_log (wiped in beforeEach)
    const eventRows = await db.select().from(eventLog);
    const topics = eventRows.map((r) => r.topic);
    expect(topics).toContain('payslip.generated');
    expect(topics).toContain('payroll.run.completed');
  });

  // ─── Test 2: Re-run wipes prior payslips ─────────────────────────────────
  it('re-run wipes prior payslips and recomputes; same pay_run id re-used', async () => {
    const emp = await makeEmployee('CG-P002');

    // First run: 13 worked days
    const initialDays = [
      '2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19', '2026-05-20',
      '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24', '2026-05-25',
      '2026-05-26', '2026-05-27', '2026-05-28',
    ];
    await makeDtrEntries(emp.id, initialDays);

    const run1 = await runPayroll('2026-05-16', '2026-05-31');
    expect(run1.status).toBe('calculated');

    const slips1 = await db.select().from(payslips).where(eq(payslips.payRunId, run1.id));
    expect(slips1).toHaveLength(1);
    expect(Number(slips1[0]!.daysWorked)).toBe(13);

    // Remove one DTR entry to simulate a change.
    await db.delete(dtrEntries).where(
      and(eq(dtrEntries.employeeId, emp.id), eq(dtrEntries.date, '2026-05-28')),
    );

    // Second run on the same period.
    const run2 = await runPayroll('2026-05-16', '2026-05-31');

    // Same pay_run id (re-used, not new).
    expect(run2.id).toBe(run1.id);
    expect(run2.status).toBe('calculated');

    // Still exactly 1 payslip (old one was deleted + re-inserted).
    const slips2 = await db.select().from(payslips).where(eq(payslips.payRunId, run2.id));
    expect(slips2).toHaveLength(1);
    // daysWorked updated to 12 (one entry removed).
    expect(Number(slips2[0]!.daysWorked)).toBe(12);
  });

  // ─── Test 3: Employee with zero DTR rows completes without aborting run ───
  it('employee with zero DTR rows in period gets grossPay=0 and run still completes', async () => {
    const empA = await makeEmployee('CG-P003A');
    const empB = await makeEmployee('CG-P003B');

    // empA has worked days; empB has none.
    await makeDtrEntries(empA.id, ['2026-05-16', '2026-05-17', '2026-05-18']);

    const run = await runPayroll('2026-05-16', '2026-05-31');
    expect(run.status).toBe('calculated');

    // Both employees should have payslips.
    const allSlips = await db.select().from(payslips).where(eq(payslips.payRunId, run.id));
    expect(allSlips).toHaveLength(2);

    const slipA = allSlips.find((s) => s.employeeId === empA.id)!;
    const slipB = allSlips.find((s) => s.employeeId === empB.id)!;

    expect(slipA).toBeDefined();
    expect(Number(slipA.daysWorked)).toBe(3);

    // empB: zero days → grossPay = 0.
    // For SEMI_MONTHLY final cut: statutory is still computed but netPay clamped to 0.
    expect(slipB).toBeDefined();
    expect(Number(slipB.daysWorked)).toBe(0);
    expect(Number(slipB.grossPay)).toBe(0);
    expect(Number(slipB.netPay)).toBe(0);
  });

  // ─── Test 4: Status filter — applicant and terminated excluded ────────────
  it('applicant and terminated employees are excluded from the payroll run', async () => {
    const activeEmp = await makeEmployee('CG-P004A');
    const applicantEmp = await makeEmployee('CG-P004B', { status: 'applicant' });
    const terminatedEmp = await makeEmployee('CG-P004C', { status: 'terminated' });

    // Give all three employees DTR entries so we can confirm only the active one is processed.
    await makeDtrEntries(activeEmp.id, ['2026-05-16', '2026-05-17']);
    await makeDtrEntries(applicantEmp.id, ['2026-05-16', '2026-05-17']);
    await makeDtrEntries(terminatedEmp.id, ['2026-05-16', '2026-05-17']);

    const run = await runPayroll('2026-05-16', '2026-05-31');
    expect(run.status).toBe('calculated');

    const allSlips = await db.select().from(payslips).where(eq(payslips.payRunId, run.id));
    // Only the active employee gets a payslip.
    expect(allSlips).toHaveLength(1);
    expect(allSlips[0]!.employeeId).toBe(activeEmp.id);
  });

  // ─── Test 5a: 15th-cut period → no statutory deductions ──────────────────
  it('15th-cut period (periodEnd day < 28): statutory deductions are zero', async () => {
    const emp = await makeEmployee('CG-P005A');
    await makeDtrEntries(emp.id, [
      '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
      '2026-05-06', '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10',
      '2026-05-11', '2026-05-12', '2026-05-13',
    ]);

    // No isFinalCutOfMonth override — heuristic: day 15 < 28 → false.
    const run = await runPayroll('2026-05-01', '2026-05-15');
    expect(run.status).toBe('calculated');

    const slips = await db
      .select()
      .from(payslips)
      .where(and(eq(payslips.payRunId, run.id), eq(payslips.employeeId, emp.id)));
    expect(slips).toHaveLength(1);

    const slip = slips[0]!;
    // First cut → statutory should all be 0.
    expect(Number(slip.sssEE)).toBe(0);
    expect(Number(slip.philhealthEE)).toBe(0);
    expect(Number(slip.pagibigEE)).toBe(0);
    expect(Number(slip.birWtax)).toBe(0);
    // grossPay ≈ netPay (no deductions).
    expect(Number(slip.netPay)).toBeCloseTo(Number(slip.grossPay), 2);
  });

  // ─── Test 5b: Final-cut period → full statutory deductions ───────────────
  it('final-cut period (periodEnd day >= 28): full statutory deductions applied', async () => {
    const emp = await makeEmployee('CG-P005B');
    await makeDtrEntries(emp.id, [
      '2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19', '2026-05-20',
      '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24', '2026-05-25',
      '2026-05-26', '2026-05-27', '2026-05-28',
    ]);

    // No override — heuristic: day 31 >= 28 → true.
    const run = await runPayroll('2026-05-16', '2026-05-31');
    expect(run.status).toBe('calculated');

    const slips = await db
      .select()
      .from(payslips)
      .where(and(eq(payslips.payRunId, run.id), eq(payslips.employeeId, emp.id)));
    expect(slips).toHaveLength(1);

    const slip = slips[0]!;
    // Final cut → statutory deductions should be non-zero.
    expect(Number(slip.sssEE)).toBeGreaterThan(0);
    expect(Number(slip.philhealthEE)).toBeGreaterThan(0);
    expect(Number(slip.pagibigEE)).toBeGreaterThan(0);
    // netPay < grossPay because deductions were applied.
    expect(Number(slip.netPay)).toBeLessThan(Number(slip.grossPay));
  });
});

// ─── lockPayRun suite ─────────────────────────────────────────────────────────

describe('payroll module — lockPayRun', () => {
  const db = getDb();

  // Timestamp captured at the start of each test for filtering audit_log.
  let testStart: Date;

  beforeAll(async () => {
    // Compliance rates must exist for runPayroll (used in the happy-path test).
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });

  beforeEach(async () => {
    testStart = new Date();

    // FK-ordered wipe (same order as the runPayroll suite).
    await db.delete(payslips);
    await db.delete(payRuns);
    await db.delete(dtrEntries);
    await db.delete(dtrPeriodCloses);
    await db.delete(assignmentsTable);
    await db.delete(detachments);
    await db.delete(clients);
    await db.delete(employees);
    await db.delete(eventLog);
  });

  // Note: closeDb is called once by the runPayroll suite's afterAll above.
  // A second closeDb here would end the shared connection before this suite runs.

  // ─── Test L1: Empty-run guard ─────────────────────────────────────────────
  it('rejects locking a pay run that has no payslips', async () => {
    // Insert a pay_run row directly (no payslips).
    const [run] = await db
      .insert(payRuns)
      .values({ periodStart: '2026-05-16', periodEnd: '2026-05-31', status: 'calculated', workDaysPerMonth: 26 })
      .returning();

    await expect(lockPayRun(run!.id)).rejects.toThrow(
      'This pay run has no payslips. Run the calculation first before locking.',
    );
  });

  // ─── Test L2: Pay-run-not-found ───────────────────────────────────────────
  it('rejects locking a non-existent pay run id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await expect(lockPayRun(fakeId)).rejects.toThrow(`Pay run not found: ${fakeId}`);
  });

  // ─── Test L3: Happy path ──────────────────────────────────────────────────
  it('happy path: locks a calculated pay run and emits audit + event', async () => {
    const emp = await makeEmployee('CG-L003');
    await makeDtrEntries(emp.id, [
      '2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19', '2026-05-20',
    ]);

    const payRun = await runPayroll('2026-05-16', '2026-05-31');
    expect(payRun.status).toBe('calculated');

    const locked = await lockPayRun(payRun.id, { actorUserId: null });

    // Returned row reflects the new status.
    expect(locked.status).toBe('locked');
    expect(locked.lockedAt).not.toBeNull();
    expect(locked.id).toBe(payRun.id);

    // audit_log: filter by testStart (append-only, cannot DELETE).
    const auditRows = await db
      .select()
      .from(auditLog)
      .where(gte(auditLog.createdAt, testStart));
    const actions = auditRows.map((r) => r.action);
    expect(actions).toContain('payroll.run.locked');

    // Spot-check payload shape.
    const lockRow = auditRows.find((r) => r.action === 'payroll.run.locked')!;
    expect(lockRow).toBeDefined();
    expect((lockRow.payload as any).payslipCount).toBeGreaterThan(0);

    // event_log (wiped in beforeEach).
    const eventRows = await db.select().from(eventLog);
    const topics = eventRows.map((r) => r.topic);
    expect(topics).toContain('payroll.run.locked');
  });

  // ─── Test L4: Already-locked guard ───────────────────────────────────────
  it('rejects locking a pay run that is already locked', async () => {
    const emp = await makeEmployee('CG-L004');
    await makeDtrEntries(emp.id, ['2026-05-16', '2026-05-17', '2026-05-18']);

    const payRun = await runPayroll('2026-05-16', '2026-05-31');
    await lockPayRun(payRun.id);

    // Second lock attempt must throw.
    await expect(lockPayRun(payRun.id)).rejects.toThrow(
      'This pay run is already locked',
    );
  });
});

// ─── payroll subscriptions suite ─────────────────────────────────────────────

describe('payroll module — subscriptions (dtr.period.closed → runPayroll)', () => {
  const db = getDb();

  beforeAll(async () => {
    // Compliance rates must exist for runPayroll.
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });

  beforeEach(async () => {
    // Reset subscriptions BEFORE any initPayrollSubscriptions() call.
    _resetPayrollSubscriptionsForTests();
    // Wipe leftover listeners from prior describe blocks.
    _resetEventsForTests();

    // FK-ordered wipe (same order as the other suites).
    await db.delete(payslips);
    await db.delete(payRuns);
    await db.delete(dtrEntries);
    await db.delete(dtrPeriodCloses);
    await db.delete(assignmentsTable);
    await db.delete(detachments);
    await db.delete(clients);
    await db.delete(employees);
    await db.delete(eventLog);
  });

  afterEach(() => {
    // Ensure no subscription leaks into the next test.
    _resetPayrollSubscriptionsForTests();
    _resetEventsForTests();
  });

  // ─── Test S1: Happy path ──────────────────────────────────────────────────
  it('happy path: closePeriod fires dtr.period.closed → runPayroll auto-runs', async () => {
    const emp = await makeEmployee('CG-S001');

    // 13 worked days across May 16–31
    const workDays = [
      '2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19', '2026-05-20',
      '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-25', '2026-05-26',
      '2026-05-27', '2026-05-28', '2026-05-29',
    ];
    await makeDtrEntries(emp.id, workDays);

    initPayrollSubscriptions();

    // Close the period — this publishes dtr.period.closed (delivered via setImmediate).
    await dtr.closePeriod('2026-05-16', '2026-05-31');

    // Poll for the pay_runs row for up to 2 s (10 × 200 ms) while the async
    // subscriber finishes its many awaits inside runPayroll.
    let payRunRows: typeof payRuns.$inferSelect[] = [];
    for (let i = 0; i < 10; i++) {
      payRunRows = await db
        .select()
        .from(payRuns)
        .where(
          and(
            eq(payRuns.periodStart, '2026-05-16'),
            eq(payRuns.periodEnd, '2026-05-31'),
          ),
        );
      if (payRunRows.length > 0 && payRunRows[0]!.status === 'calculated') break;
      await new Promise<void>((r) => setTimeout(r, 200));
    }

    expect(payRunRows).toHaveLength(1);
    expect(payRunRows[0]!.status).toBe('calculated');

    // Exactly one payslip for the employee.
    const slips = await db
      .select()
      .from(payslips)
      .where(eq(payslips.payRunId, payRunRows[0]!.id));
    expect(slips).toHaveLength(1);
    expect(slips[0]!.employeeId).toBe(emp.id);
  });

  // ─── Test S2: Idempotent init ─────────────────────────────────────────────
  it('idempotent init: calling initPayrollSubscriptions() twice only subscribes once', async () => {
    const emp = await makeEmployee('CG-S002');

    const workDays = [
      '2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19', '2026-05-20',
      '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-25', '2026-05-26',
      '2026-05-27', '2026-05-28', '2026-05-29',
    ];
    await makeDtrEntries(emp.id, workDays);

    // Call twice — second call should be a no-op.
    initPayrollSubscriptions();
    initPayrollSubscriptions();

    await dtr.closePeriod('2026-05-16', '2026-05-31');

    // Poll for the pay_runs row.
    let payRunRows: typeof payRuns.$inferSelect[] = [];
    for (let i = 0; i < 10; i++) {
      payRunRows = await db
        .select()
        .from(payRuns)
        .where(
          and(
            eq(payRuns.periodStart, '2026-05-16'),
            eq(payRuns.periodEnd, '2026-05-31'),
          ),
        );
      if (payRunRows.length > 0 && payRunRows[0]!.status === 'calculated') break;
      await new Promise<void>((r) => setTimeout(r, 200));
    }

    expect(payRunRows).toHaveLength(1);

    // Exactly ONE payslip — not two (which would indicate double-run).
    const slips = await db
      .select()
      .from(payslips)
      .where(eq(payslips.payRunId, payRunRows[0]!.id));
    expect(slips).toHaveLength(1);
  });

  // ─── Test S3: Missing payload fields → no crash, no pay_run ──────────────
  it('missing periodStart/periodEnd in payload → no pay_run created, no throw', async () => {
    initPayrollSubscriptions();

    // Publish the event directly with an empty payload (no periodStart/periodEnd).
    await events.publish('dtr.period.closed', {});

    // Wait two setImmediate ticks for the subscriber to process.
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    // No pay_runs row should exist.
    const payRunRows = await db.select().from(payRuns);
    expect(payRunRows).toHaveLength(0);
  });
});

// ─── getPayslip / listPayslips suite ─────────────────────────────────────────

describe('payroll module — getPayslip / listPayslips', () => {
  const db = getDb();

  beforeAll(async () => {
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });

  beforeEach(async () => {
    // FK-ordered wipe (same order as the other suites).
    await db.delete(payslips);
    await db.delete(payRuns);
    await db.delete(dtrEntries);
    await db.delete(dtrPeriodCloses);
    await db.delete(assignmentsTable);
    await db.delete(detachments);
    await db.delete(clients);
    await db.delete(employees);
    await db.delete(eventLog);
  });

  // ─── Test R1: getPayslip happy path ──────────────────────────────────────
  it('getPayslip happy path: fetches the correct payslip by id', async () => {
    const emp = await makeEmployee('CG-R001');
    await makeDtrEntries(emp.id, ['2026-05-16', '2026-05-17', '2026-05-18']);

    const run = await runPayroll('2026-05-16', '2026-05-31');

    // Pull the persisted payslip id from the DB.
    const dbRows = await db
      .select()
      .from(payslips)
      .where(eq(payslips.payRunId, run.id));
    expect(dbRows).toHaveLength(1);
    const payslipId = dbRows[0]!.id;

    // Now use the accessor.
    const result = await getPayslip(payslipId);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(payslipId);
    expect(result!.employeeId).toBe(emp.id);
    expect(result!.payRunId).toBe(run.id);
    expect(Number(result!.daysWorked)).toBe(3);
  });

  // ─── Test R2: getPayslip not found → null ─────────────────────────────────
  it('getPayslip returns null for a non-existent id (no throw)', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const result = await getPayslip(fakeId);
    expect(result).toBeNull();
  });

  // ─── Test R3: listPayslips by payRunId ────────────────────────────────────
  it('listPayslips({ payRunId }) returns all payslips for that pay run', async () => {
    const empA = await makeEmployee('CG-R003A');
    const empB = await makeEmployee('CG-R003B');
    await makeDtrEntries(empA.id, ['2026-05-16', '2026-05-17']);
    await makeDtrEntries(empB.id, ['2026-05-16', '2026-05-17']);

    const run = await runPayroll('2026-05-16', '2026-05-31');

    const results = await listPayslips({ payRunId: run.id });

    expect(results).toHaveLength(2);
    const empIds = results.map((r) => r.employeeId);
    expect(empIds).toContain(empA.id);
    expect(empIds).toContain(empB.id);
  });

  // ─── Test R4: listPayslips by employeeId, ordered newest first ───────────
  it('listPayslips({ employeeId }) returns all payslips across runs, ordered by createdAt DESC', async () => {
    const emp = await makeEmployee('CG-R004');
    await makeDtrEntries(emp.id, ['2026-05-01', '2026-05-02', '2026-05-03']);
    await makeDtrEntries(emp.id, ['2026-05-16', '2026-05-17', '2026-05-18']);

    // First cut (May 1–15): not a final cut, so isFinalCutOfMonth = false.
    await runPayroll('2026-05-01', '2026-05-15', { isFinalCutOfMonth: false });
    // Second cut (May 16–31): final cut.
    await runPayroll('2026-05-16', '2026-05-31', { isFinalCutOfMonth: true });

    const results = await listPayslips({ employeeId: emp.id });

    expect(results).toHaveLength(2);
    // Newest first: May 16–31 payslip should come before May 1–15 payslip.
    expect(results[0]!.createdAt >= results[1]!.createdAt).toBe(true);
  });

  // ─── Test R5: listPayslips by payRunId + employeeId ──────────────────────
  it('listPayslips({ payRunId, employeeId }) returns exactly 1 row for that employee', async () => {
    const empA = await makeEmployee('CG-R005A');
    const empB = await makeEmployee('CG-R005B');
    await makeDtrEntries(empA.id, ['2026-05-16', '2026-05-17']);
    await makeDtrEntries(empB.id, ['2026-05-16', '2026-05-17']);

    const run = await runPayroll('2026-05-16', '2026-05-31');

    const results = await listPayslips({ payRunId: run.id, employeeId: empA.id });

    expect(results).toHaveLength(1);
    expect(results[0]!.employeeId).toBe(empA.id);
  });

  // ─── Test R6: listPayslips({}) throws ────────────────────────────────────
  it('listPayslips({}) throws "requires at least one" error without hitting the DB', async () => {
    await expect(listPayslips({})).rejects.toThrow(
      'listPayslips requires at least one of payRunId or employeeId',
    );
  });
});

// Close the shared DB connection once, after all suites in this file finish.
afterAll(async () => {
  await closeDb();
});
