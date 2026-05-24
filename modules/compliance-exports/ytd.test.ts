/**
 * ytd.test.ts — Task 7.2 acceptance.
 *
 * Seeds two LOCKED pay runs for 2026 with known per-payslip numbers.
 * Asserts that computeYtd returns the exact sums.
 *
 * Also verifies:
 *  - only LOCKED runs are included (draft/calculated runs are excluded)
 *  - zero-aggregate when no qualifying runs exist
 *  - year boundary is respected (runs outside the year are excluded)
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { payRuns, payslips } from '@/modules/payroll/schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { employees } from '@/modules/hr/schema';
import { eventLog } from '@/modules/events/schema';
import { hr } from '@/modules/hr/index';
import { runPayroll, lockPayRun, _resetPayrollSubscriptionsForTests } from '@/modules/payroll/index';
import { _resetEventsForTests } from '@/modules/events/index';
import { seedComplianceRates } from '@/modules/compliance/seed';
import { computeYtd } from './ytd';

const P1_START = '2026-05-01';
const P1_END   = '2026-05-15';
const P1_DATES = [
  '2026-05-01','2026-05-02','2026-05-04','2026-05-05','2026-05-06',
  '2026-05-07','2026-05-08','2026-05-09','2026-05-11','2026-05-12',
  '2026-05-13','2026-05-14','2026-05-15',
];

const P2_START = '2026-05-16';
const P2_END   = '2026-05-31';
const P2_DATES = [
  '2026-05-16','2026-05-18','2026-05-19','2026-05-20','2026-05-21',
  '2026-05-22','2026-05-23','2026-05-25','2026-05-26','2026-05-27',
  '2026-05-28','2026-05-29','2026-05-30',
];

// A run that falls in a different year — must NOT be included in 2026 YTD.
const P_2025_START = '2025-12-01';
const P_2025_END   = '2025-12-15';
const P_2025_DATES = [
  '2025-12-01','2025-12-02','2025-12-03','2025-12-04','2025-12-05',
  '2025-12-08','2025-12-09','2025-12-10','2025-12-11','2025-12-12',
  '2025-12-15',
];

async function insertDtr(employeeId: string, dates: string[]) {
  if (dates.length === 0) return;
  await getDb()
    .insert(dtrEntries)
    .values(dates.map((date) => ({ employeeId, date, status: 'worked' as const })));
}

describe('compliance-exports.ytd', () => {
  const db = getDb();

  beforeAll(async () => {
    await seedComplianceRates({ effectiveDate: '2025-01-01' });
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });

  beforeEach(async () => {
    _resetPayrollSubscriptionsForTests();
    _resetEventsForTests();
    await db.delete(payslips);
    await db.delete(payRuns);
    await db.delete(dtrEntries);
    await db.delete(dtrPeriodCloses);
    await db.delete(assignmentsTable);
    await db.delete(employees);
    await db.delete(eventLog);
  });

  afterAll(async () => { await closeDb(); });

  it('sums gross, sss, philhealth, pagibig, wtax, net across two locked runs in year', async () => {
    const emp = await hr.createEmployee({
      employeeCode: 'YTD-01', firstName: 'Juan', lastName: 'Cruz',
      basicSalary: 18000, hiredOn: '2026-01-01',
      tinNumber: '111-222-333-000', sssNumber: '031111111',
    });

    await insertDtr(emp.id, P1_DATES);
    const run1 = await runPayroll(P1_START, P1_END);
    await lockPayRun(run1.id);

    await insertDtr(emp.id, P2_DATES);
    const run2 = await runPayroll(P2_START, P2_END);
    await lockPayRun(run2.id);

    // Get per-payslip numbers from DB so our expected values are concrete.
    const slips = await db.select().from(payslips).where(eq(payslips.employeeId, emp.id));
    expect(slips.length).toBe(2);

    const expectedGross = slips.reduce((s, r) => s + Number(r.grossPay), 0);
    const expectedSss   = slips.reduce((s, r) => s + Number(r.sssEE),   0);
    const expectedPh    = slips.reduce((s, r) => s + Number(r.philhealthEE), 0);
    const expectedPag   = slips.reduce((s, r) => s + Number(r.pagibigEE),    0);
    const expectedWtax  = slips.reduce((s, r) => s + Number(r.birWtax),      0);
    const expectedNet   = slips.reduce((s, r) => s + Number(r.netPay),       0);

    const ytd = await computeYtd(emp.id, 2026);

    expect(ytd.year).toBe(2026);
    expect(ytd.employeeId).toBe(emp.id);
    expect(ytd.payRunCount).toBe(2);
    expect(Number(ytd.gross)).toBeCloseTo(expectedGross, 2);
    expect(Number(ytd.sssEe)).toBeCloseTo(expectedSss, 2);
    expect(Number(ytd.philhealthEe)).toBeCloseTo(expectedPh, 2);
    expect(Number(ytd.pagibigEe)).toBeCloseTo(expectedPag, 2);
    expect(Number(ytd.wtax)).toBeCloseTo(expectedWtax, 2);
    expect(Number(ytd.net)).toBeCloseTo(expectedNet, 2);
  });

  it('excludes draft (unlocked) pay runs from the YTD', async () => {
    const emp = await hr.createEmployee({
      employeeCode: 'YTD-02', firstName: 'Maria', lastName: 'Santos',
      basicSalary: 18000, hiredOn: '2026-01-01',
    });

    // Run payroll but do NOT lock — should be excluded
    await insertDtr(emp.id, P1_DATES);
    await runPayroll(P1_START, P1_END);

    const ytd = await computeYtd(emp.id, 2026);

    expect(ytd.payRunCount).toBe(0);
    expect(Number(ytd.gross)).toBe(0);
  });

  it('returns zero aggregate when no pay runs exist in the year', async () => {
    const emp = await hr.createEmployee({
      employeeCode: 'YTD-03', firstName: 'Pedro', lastName: 'Reyes',
      basicSalary: 18000, hiredOn: '2026-01-01',
    });

    const ytd = await computeYtd(emp.id, 2026);

    expect(ytd.payRunCount).toBe(0);
    expect(Number(ytd.gross)).toBe(0);
    expect(Number(ytd.sssEe)).toBe(0);
    expect(Number(ytd.philhealthEe)).toBe(0);
    expect(Number(ytd.pagibigEe)).toBe(0);
    expect(Number(ytd.wtax)).toBe(0);
    expect(Number(ytd.net)).toBe(0);
  });

  it('excludes runs from a different year even when locked', async () => {
    const emp = await hr.createEmployee({
      employeeCode: 'YTD-04', firstName: 'Ana', lastName: 'Lim',
      basicSalary: 18000, hiredOn: '2025-01-01',
    });

    // A 2025 run, locked
    await insertDtr(emp.id, P_2025_DATES);
    const run2025 = await runPayroll(P_2025_START, P_2025_END);
    await lockPayRun(run2025.id);

    // 2026 query should see nothing
    const ytd2026 = await computeYtd(emp.id, 2026);
    expect(ytd2026.payRunCount).toBe(0);
    expect(Number(ytd2026.gross)).toBe(0);

    // 2025 query should see the one run
    const ytd2025 = await computeYtd(emp.id, 2025);
    expect(ytd2025.payRunCount).toBe(1);
    expect(Number(ytd2025.gross)).toBeGreaterThan(0);
  });
});
