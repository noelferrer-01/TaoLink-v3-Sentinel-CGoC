/**
 * reconciliation.test.ts — V2 reconciliation gate (Done criterion #7).
 *
 * Proves that Sentinel's payroll engine reproduces v2's PayrollCentral output
 * within ₱1.00 per line for 3 reference cases. Every expected value here is
 * hand-computed and documented in:
 *   wiki/slices/1-first-payslip-reconciliation.md
 *
 * Reference period: 2026-05-16 → 2026-05-31 (SEMI_MONTHLY, final cut).
 * Work days per month: 26 (guard standard).
 * Days worked: 13 for all three cases.
 * OT hours: 0.
 *
 * Cleanup follows the same FK-ordered wipe as payroll.test.ts.
 * Compliance tables are intentionally NOT wiped (idempotent seed in beforeAll).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { and, eq, between } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { payRuns, payslips } from './schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { detachments, clients } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';
import { eventLog } from '@/modules/events/schema';
import { hr } from '@/modules/hr/index';
import { seedComplianceRates } from '@/modules/compliance/seed';
import { runPayroll, _resetPayrollSubscriptionsForTests } from './index';
import { _resetEventsForTests } from '@/modules/events/index';

// ─── Period ───────────────────────────────────────────────────────────────────

const PERIOD_START = '2026-05-16';
const PERIOD_END   = '2026-05-31';

// 13 worked days in May 16–31 (Sundays 17, 24, 31 excluded — use Mon-Sat span)
const WORKED_DAYS = [
  '2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19', '2026-05-20',
  '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-25', '2026-05-26',
  '2026-05-27', '2026-05-28', '2026-05-29',
];

// ─── Fixture helpers ──────────────────────────────────────────────────────────

async function makeEmployee(code: string, salary: number) {
  return hr.createEmployee({
    employeeCode: code,
    firstName: 'Recon',
    lastName: 'Case',
    basicSalary: salary,
    hiredOn: '2026-01-01',
    payFrequency: 'SEMI_MONTHLY',
  });
}

async function insertDtrEntries(employeeId: string, dates: string[]) {
  const db = getDb();
  if (dates.length === 0) return;
  await db.insert(dtrEntries).values(
    dates.map((date) => ({ employeeId, date, status: 'worked' as const })),
  );
}

// ─── Assertion helper ─────────────────────────────────────────────────────────

/**
 * Assert that actual is within ₱1.00 of expected.
 * Vitest's toBeCloseTo(expected, 0) uses 0.5 tolerance (half of 10^-0),
 * which is too tight for our ₱1 gate. Use explicit Math.abs check instead.
 */
function assertWithinOnePeso(
  actual: number,
  expected: number,
  label: string,
  employeeCode: string,
) {
  const diff = Math.abs(actual - expected);
  if (diff >= 1) {
    throw new Error(
      `[reconciliation] ${employeeCode} — ${label}: actual ₱${actual.toFixed(2)} vs expected ₱${expected.toFixed(2)} (diff ₱${diff.toFixed(2)} ≥ ₱1.00)`,
    );
  }
  // Also fire a vitest matcher so the test registers the assertion correctly.
  expect(diff).toBeLessThan(1);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('payroll module — v2 reconciliation (Done criterion #7)', () => {
  const db = getDb();

  beforeAll(async () => {
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });

  beforeEach(async () => {
    _resetPayrollSubscriptionsForTests();
    _resetEventsForTests();

    // FK-ordered wipe. Compliance tables intentionally excluded.
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

  // ─── Case A: ₱14,000 monthly basic ────────────────────────────────────────
  //
  // Hand-computed (wiki/slices/1-first-payslip-reconciliation.md, Case A):
  //   gross     = 14000/26 × 13 = ₱7,000.00
  //   sssEE     = 14000 × 0.05 = ₱700.00   (MSC 14000, below WISP threshold)
  //   philhealth= 14000 × 0.05/2 = ₱350.00
  //   pagibig   = min(14000,10000) × 0.02 = ₱200.00
  //   taxable   = 7000 - 700 - 350 - 200 = ₱5,750.00
  //   WTAX      = 0 (bracket [0, 10417) → 0%)
  //   net       = ₱5,750.00
  it('Case A — ₱14,000 basic / 13 days: gross ₱7,000 / sss ₱700 / ph ₱350 / hdmf ₱200 / wtax ₱0 / net ₱5,750', async () => {
    const emp = await makeEmployee('RECON-A', 14000);
    await insertDtrEntries(emp.id, WORKED_DAYS);

    const run = await runPayroll(PERIOD_START, PERIOD_END);
    expect(run.status).toBe('calculated');

    const slips = await db
      .select()
      .from(payslips)
      .where(and(eq(payslips.payRunId, run.id), eq(payslips.employeeId, emp.id)));

    expect(slips).toHaveLength(1);
    const slip = slips[0]!;

    expect(Number(slip.daysWorked)).toBe(13);

    assertWithinOnePeso(Number(slip.grossPay),      7000.00, 'grossPay',     'RECON-A');
    assertWithinOnePeso(Number(slip.sssEE),          700.00, 'sssEE',        'RECON-A');
    assertWithinOnePeso(Number(slip.philhealthEE),   350.00, 'philhealthEE', 'RECON-A');
    assertWithinOnePeso(Number(slip.pagibigEE),      200.00, 'pagibigEE',    'RECON-A');
    assertWithinOnePeso(Number(slip.birWtax),          0.00, 'birWtax',      'RECON-A');
    assertWithinOnePeso(Number(slip.netPay),        5750.00, 'netPay',       'RECON-A');
  });

  // ─── Case B: ₱18,000 monthly basic ────────────────────────────────────────
  //
  // Hand-computed (wiki/slices/1-first-payslip-reconciliation.md, Case B):
  //   gross     = 18000/26 × 13 = ₱9,000.00
  //   sssEE     = 18000 × 0.05 = ₱900.00   (MSC 18000, below WISP threshold)
  //   philhealth= 18000 × 0.05/2 = ₱450.00
  //   pagibig   = min(18000,10000) × 0.02 = ₱200.00
  //   taxable   = 9000 - 900 - 450 - 200 = ₱7,450.00
  //   WTAX      = 0 (bracket [0, 10417) → 0%)
  //   net       = ₱7,450.00
  //
  // Also independently validated by payroll.test.ts Test 1 (happy path).
  it('Case B — ₱18,000 basic / 13 days: gross ₱9,000 / sss ₱900 / ph ₱450 / hdmf ₱200 / wtax ₱0 / net ₱7,450', async () => {
    const emp = await makeEmployee('RECON-B', 18000);
    await insertDtrEntries(emp.id, WORKED_DAYS);

    const run = await runPayroll(PERIOD_START, PERIOD_END);
    expect(run.status).toBe('calculated');

    const slips = await db
      .select()
      .from(payslips)
      .where(and(eq(payslips.payRunId, run.id), eq(payslips.employeeId, emp.id)));

    expect(slips).toHaveLength(1);
    const slip = slips[0]!;

    expect(Number(slip.daysWorked)).toBe(13);

    assertWithinOnePeso(Number(slip.grossPay),      9000.00, 'grossPay',     'RECON-B');
    assertWithinOnePeso(Number(slip.sssEE),          900.00, 'sssEE',        'RECON-B');
    assertWithinOnePeso(Number(slip.philhealthEE),   450.00, 'philhealthEE', 'RECON-B');
    assertWithinOnePeso(Number(slip.pagibigEE),      200.00, 'pagibigEE',    'RECON-B');
    assertWithinOnePeso(Number(slip.birWtax),          0.00, 'birWtax',      'RECON-B');
    assertWithinOnePeso(Number(slip.netPay),        7450.00, 'netPay',       'RECON-B');
  });

  // ─── Case C: ₱28,000 monthly basic ────────────────────────────────────────
  //
  // Hand-computed (wiki/slices/1-first-payslip-reconciliation.md, Case C):
  //   gross     = 28000/26 × 13 = ₱14,000.00
  //   sssEE     = 28000 × 0.05 = ₱1,400.00 (MSC 28000, above WISP threshold:
  //               eeRegular=28000×0.04=₱1,120 + eeWisp=28000×0.01=₱280)
  //   philhealth= 28000 × 0.05/2 = ₱700.00
  //   pagibig   = min(28000,10000) × 0.02 = ₱200.00
  //   taxable   = 14000 - 1400 - 700 - 200 = ₱11,700.00
  //   WTAX      = 0 + (11700 - 10417) × 0.15 = 1283 × 0.15 = ₱192.45
  //               (bracket [10417, 16667) → baseTax=0, 15%)
  //   net       = 14000 - 1400 - 700 - 200 - 192.45 = ₱11,507.55
  it('Case C — ₱28,000 basic / 13 days: gross ₱14,000 / sss ₱1,400 / ph ₱700 / hdmf ₱200 / wtax ₱192.45 / net ₱11,507.55', async () => {
    const emp = await makeEmployee('RECON-C', 28000);
    await insertDtrEntries(emp.id, WORKED_DAYS);

    const run = await runPayroll(PERIOD_START, PERIOD_END);
    expect(run.status).toBe('calculated');

    const slips = await db
      .select()
      .from(payslips)
      .where(and(eq(payslips.payRunId, run.id), eq(payslips.employeeId, emp.id)));

    expect(slips).toHaveLength(1);
    const slip = slips[0]!;

    expect(Number(slip.daysWorked)).toBe(13);

    assertWithinOnePeso(Number(slip.grossPay),      14000.00, 'grossPay',     'RECON-C');
    assertWithinOnePeso(Number(slip.sssEE),          1400.00, 'sssEE',        'RECON-C');
    assertWithinOnePeso(Number(slip.philhealthEE),    700.00, 'philhealthEE', 'RECON-C');
    assertWithinOnePeso(Number(slip.pagibigEE),       200.00, 'pagibigEE',    'RECON-C');
    assertWithinOnePeso(Number(slip.birWtax),         192.45, 'birWtax',      'RECON-C');
    assertWithinOnePeso(Number(slip.netPay),        11507.55, 'netPay',       'RECON-C');
  });
});

// Close the shared DB connection once, after all suites in this file finish.
afterAll(async () => {
  await closeDb();
});
