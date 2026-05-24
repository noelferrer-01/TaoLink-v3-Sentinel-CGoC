/**
 * bir-2316.test.ts — Task 7.4 acceptance.
 *
 * Asserts exportBIR_2316(employeeId, year) sums the employee's payslips in the
 * year and returns a structured object matching BIR_2316_FORMAT.md.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { and, eq, gte } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { payRuns, payslips } from '@/modules/payroll/schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { employees } from '@/modules/hr/schema';
import { auditLog } from '@/modules/audit/schema';
import { eventLog } from '@/modules/events/schema';
import { hr } from '@/modules/hr/index';
import { runPayroll, _resetPayrollSubscriptionsForTests } from '@/modules/payroll/index';
import { _resetEventsForTests } from '@/modules/events/index';
import { seedComplianceRates } from '@/modules/compliance/seed';
import { exportBIR_2316 } from './bir-2316';

// Two semi-monthly periods in May 2026; 13 work days each.
const PERIOD_1_START = '2026-05-01';
const PERIOD_1_END   = '2026-05-15';
const PERIOD_2_START = '2026-05-16';
const PERIOD_2_END   = '2026-05-31';

const PERIOD_1_DATES = [
  '2026-05-01','2026-05-02','2026-05-04','2026-05-05','2026-05-06',
  '2026-05-07','2026-05-08','2026-05-09','2026-05-11','2026-05-12',
  '2026-05-13','2026-05-14','2026-05-15',
];
const PERIOD_2_DATES = [
  '2026-05-16','2026-05-18','2026-05-19','2026-05-20','2026-05-21',
  '2026-05-22','2026-05-23','2026-05-25','2026-05-26','2026-05-27',
  '2026-05-28','2026-05-29','2026-05-30',
];

async function insertDtr(employeeId: string, dates: string[]) {
  if (dates.length === 0) return;
  await getDb()
    .insert(dtrEntries)
    .values(dates.map((date) => ({ employeeId, date, status: 'worked' as const })));
}

describe('compliance-exports.bir-2316', () => {
  const db = getDb();

  beforeAll(async () => {
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

  it('aggregates two pay runs in the year into one 2316 summary', async () => {
    const e = await hr.createEmployee({
      employeeCode: '2316-A', firstName: 'Juan', lastName: 'Dela Cruz', middleName: 'A',
      basicSalary: 18000, hiredOn: '2026-01-01',
      tinNumber: '123-456-789-000', sssNumber: '0312345677',
    });

    await insertDtr(e.id, PERIOD_1_DATES);
    const run1 = await runPayroll(PERIOD_1_START, PERIOD_1_END);
    await insertDtr(e.id, PERIOD_2_DATES);
    const run2 = await runPayroll(PERIOD_2_START, PERIOD_2_END);

    const slips = await db.select().from(payslips).where(eq(payslips.employeeId, e.id));
    expect(slips.length).toBe(2);

    const expectedGross = slips.reduce((acc, s) => acc + Number(s.grossPay), 0);
    const expectedNonTax = slips.reduce(
      (acc, s) => acc + Number(s.sssEE) + Number(s.philhealthEE) + Number(s.pagibigEE), 0);
    const expectedWtax = slips.reduce((acc, s) => acc + Number(s.birWtax), 0);

    const result = await exportBIR_2316(e.id, 2026);

    expect(result.year).toBe(2026);
    expect(result.employee.tin).toBe('123-456-789-000');
    expect(result.employee.lastName).toBe('Dela Cruz');
    expect(result.summary.grossCompensation).toBeCloseTo(expectedGross, 2);
    expect(result.summary.nonTaxable).toBeCloseTo(expectedNonTax, 2);
    expect(result.summary.taxableFromPresent).toBeCloseTo(expectedGross - expectedNonTax, 2);
    expect(result.summary.taxableFromPrevious).toBe(0);
    expect(result.summary.grossTaxable).toBeCloseTo(expectedGross - expectedNonTax, 2);
    expect(result.summary.taxesWithheldPresent).toBeCloseTo(expectedWtax, 2);
    expect(result.summary.taxesWithheldPrevious).toBe(0);
    expect(result.summary.totalTaxesWithheldAdjusted).toBeCloseTo(expectedWtax, 2);
    expect(result.partialYear).toBe(true); // only May payslips, year is incomplete
    // No TIN warning since employee has one; partial-year warning is expected.
    expect(result.warnings.some((w) => /tin/i.test(w))).toBe(false);
    expect(result.warnings.some((w) => /partial-year/i.test(w))).toBe(true);

    // Sanity: tax due is non-negative; for this low income (₱18k/mo annualized
    // taxable ≈ ₱200k), should be exactly 0 (below ₱250k zero-bracket).
    expect(result.summary.taxDue).toBe(0);
  });

  it('surfaces a warning when TIN is missing', async () => {
    const e = await hr.createEmployee({
      employeeCode: '2316-NOTIN', firstName: 'Maria', lastName: 'Santos',
      basicSalary: 18000, hiredOn: '2026-01-01' /* no tin */,
    });
    await insertDtr(e.id, PERIOD_1_DATES);
    await runPayroll(PERIOD_1_START, PERIOD_1_END);

    const result = await exportBIR_2316(e.id, 2026);
    expect(result.employee.tin).toBeNull();
    expect(result.warnings.some((w) => /tin/i.test(w))).toBe(true);
  });

  it('returns zero summary for a year with no payslips', async () => {
    const e = await hr.createEmployee({
      employeeCode: '2316-EMPTY', firstName: 'Pedro', lastName: 'Reyes',
      basicSalary: 18000, hiredOn: '2026-01-01', tinNumber: '999-999-999-000',
    });

    const result = await exportBIR_2316(e.id, 2025);
    expect(result.summary.grossCompensation).toBe(0);
    expect(result.summary.taxDue).toBe(0);
    expect(result.summary.totalTaxesWithheldAdjusted).toBe(0);
    expect(result.partialYear).toBe(true);
  });

  it('throws when employee does not exist', async () => {
    await expect(exportBIR_2316('00000000-0000-0000-0000-000000000000', 2026))
      .rejects.toThrow(/employee not found/i);
  });

  it('records an audit entry and publishes an event', async () => {
    const testStart = new Date();
    const e = await hr.createEmployee({
      employeeCode: '2316-AUD', firstName: 'A', lastName: 'B',
      basicSalary: 18000, hiredOn: '2026-01-01', tinNumber: '111-222-333-000',
    });
    await insertDtr(e.id, PERIOD_1_DATES);
    await runPayroll(PERIOD_1_START, PERIOD_1_END);
    await exportBIR_2316(e.id, 2026);

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'compliance.export.bir_2316'), gte(auditLog.createdAt, testStart)));
    expect(audits.length).toBe(1);
    expect(audits[0]!.targetKind).toBe('hr_employee');
    expect(audits[0]!.targetId).toBe(e.id);

    const events = await db.select().from(eventLog).where(eq(eventLog.topic, 'compliance.export.bir_2316'));
    expect(events.length).toBe(1);
  });
});
