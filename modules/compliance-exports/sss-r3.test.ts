/**
 * sss-r3.test.ts — Task 7.2 acceptance.
 *
 * Asserts exportSSS_R3(payRunId) emits a CSV matching SSS_R3_FORMAT.md:
 *   - header row exactly matches the documented column order
 *   - one row per payslip in the run
 *   - SS / EC values land in the calendar-month column of the quarter
 *   - totals row sums each numeric column
 *   - missing sss_number → row emitted with sss_number=MISSING + warning
 *   - empty pay run → header + zero totals
 *   - audit + event recorded
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { payRuns, payslips } from '@/modules/payroll/schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { employees } from '@/modules/hr/schema';
import { gte, and } from 'drizzle-orm';
import { auditLog } from '@/modules/audit/schema';
import { eventLog } from '@/modules/events/schema';
import { hr } from '@/modules/hr/index';
import { runPayroll, _resetPayrollSubscriptionsForTests } from '@/modules/payroll/index';
import { _resetEventsForTests } from '@/modules/events/index';
import { seedComplianceRates } from '@/modules/compliance/seed';
import { exportSSS_R3 } from './sss-r3';

const PERIOD_START = '2026-05-16';
const PERIOD_END   = '2026-05-31';

const WORKED_DAYS = [
  '2026-05-16', '2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21',
  '2026-05-22', '2026-05-23', '2026-05-25', '2026-05-26', '2026-05-27',
  '2026-05-28', '2026-05-29', '2026-05-30',
];

async function insertDtr(employeeId: string, dates: string[]) {
  if (dates.length === 0) return;
  await getDb()
    .insert(dtrEntries)
    .values(dates.map((date) => ({ employeeId, date, status: 'worked' as const })));
}

describe('compliance-exports.sss-r3', () => {
  const db = getDb();

  beforeAll(async () => {
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });

  beforeEach(async () => {
    _resetPayrollSubscriptionsForTests();
    _resetEventsForTests();
    // FK-ordered wipe (same as payroll.test.ts).
    await db.delete(payslips);
    await db.delete(payRuns);
    await db.delete(dtrEntries);
    await db.delete(dtrPeriodCloses);
    await db.delete(assignmentsTable);
    await db.delete(employees);
    await db.delete(eventLog);
    // auditLog is append-only; tests filter by action + createdAt instead of wiping.
  });

  afterAll(async () => { await closeDb(); });

  it('emits CSV with header + 3 employee rows + totals row', async () => {
    const a = await hr.createEmployee({ employeeCode: 'R3-A', firstName: 'Juan', lastName: 'Dela Cruz', middleName: 'A', basicSalary: 18000, hiredOn: '2026-01-01', sssNumber: '0312345677' });
    const b = await hr.createEmployee({ employeeCode: 'R3-B', firstName: 'Maria', lastName: 'Santos', middleName: 'B', basicSalary: 22000, hiredOn: '2026-01-01', sssNumber: '0234567890' });
    const c = await hr.createEmployee({ employeeCode: 'R3-C', firstName: 'Pedro', lastName: 'Reyes', middleName: 'C', basicSalary: 16500, hiredOn: '2026-01-01', sssNumber: '0345678901' });
    await Promise.all([a, b, c].map((e) => insertDtr(e.id, WORKED_DAYS)));

    const run = await runPayroll(PERIOD_START, PERIOD_END);
    const { csv, rows, warnings } = await exportSSS_R3(run.id);

    expect(rows).toBe(3);
    expect(warnings).toEqual([]);

    const lines = csv.trim().split('\n');
    // header + 3 rows + totals
    expect(lines.length).toBe(5);
    expect(lines[0]).toBe('sss_number,surname,given_name,middle_initial,ss_1st_month,ss_2nd_month,ss_3rd_month,ec_1st_month,ec_2nd_month,ec_3rd_month,separation_date');

    // Each data row: sss_number populated, ss_2nd_month + ec_2nd_month populated (May = month 2 of Apr–Jun quarter),
    // other month columns blank.
    for (const line of lines.slice(1, 4)) {
      const cells = line.split(',');
      expect(cells[0]).toMatch(/^0\d{9}$/);
      // ss columns: 1st blank, 2nd populated, 3rd blank
      expect(cells[4]).toBe('');
      expect(Number(cells[5])).toBeGreaterThan(0);
      expect(cells[6]).toBe('');
      // ec columns: 1st blank, 2nd populated, 3rd blank
      expect(cells[7]).toBe('');
      expect(Number(cells[8])).toBeGreaterThan(0);
      expect(cells[9]).toBe('');
    }

    // Totals row: starts with TOTAL, sums match
    const totalCells = lines[4]!.split(',');
    expect(totalCells[0]).toBe('TOTAL');
    const ssTotal = Number(totalCells[5]);
    const ecTotal = Number(totalCells[8]);
    expect(ssTotal).toBeCloseTo(
      lines.slice(1, 4).reduce((acc, l) => acc + Number(l.split(',')[5]), 0),
      2,
    );
    expect(ecTotal).toBeCloseTo(
      lines.slice(1, 4).reduce((acc, l) => acc + Number(l.split(',')[8]), 0),
      2,
    );
  });

  it('surfaces a warning when sss_number is missing, emits MISSING in the row', async () => {
    const e = await hr.createEmployee({ employeeCode: 'R3-MISS', firstName: 'No', lastName: 'IdYet', basicSalary: 18000, hiredOn: '2026-01-01' /* no sssNumber */ });
    await insertDtr(e.id, WORKED_DAYS);

    const run = await runPayroll(PERIOD_START, PERIOD_END);
    const { csv, warnings } = await exportSSS_R3(run.id);

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/R3-MISS.*sss_number/i);
    expect(csv).toContain('MISSING,IdYet,No,');
  });

  it('empty pay run → header + totals row only, no warnings', async () => {
    // Insert a pay_run row directly (no employees so runPayroll would emit no payslips anyway).
    const [run] = await db
      .insert(payRuns)
      .values({ periodStart: PERIOD_START, periodEnd: PERIOD_END, status: 'calculated', workDaysPerMonth: 26 })
      .returning();

    const { csv, rows, warnings } = await exportSSS_R3(run!.id);
    expect(rows).toBe(0);
    expect(warnings).toEqual([]);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2); // header + totals
    expect(lines[1]).toBe('TOTAL,,,,0.00,0.00,0.00,0.00,0.00,0.00,');
  });

  it('records an audit entry and publishes an event', async () => {
    const testStart = new Date();
    const e = await hr.createEmployee({ employeeCode: 'R3-AUD', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-01-01', sssNumber: '0399999999' });
    await insertDtr(e.id, WORKED_DAYS);

    const run = await runPayroll(PERIOD_START, PERIOD_END);
    await exportSSS_R3(run.id, { actorUserId: null });

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'compliance.export.sss_r3'), gte(auditLog.createdAt, testStart)));
    expect(audits.length).toBe(1);
    expect(audits[0]!.targetKind).toBe('pay_run');
    expect(audits[0]!.targetId).toBe(run.id);

    const events = await db.select().from(eventLog).where(eq(eventLog.topic, 'compliance.export.sss_r3'));
    expect(events.length).toBe(1);
  });

  it('throws when pay_run does not exist', async () => {
    await expect(exportSSS_R3('00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow(/pay run not found/i);
  });
});
