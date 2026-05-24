/**
 * bir-2316.test.ts — Phase 7 acceptance tests for exportBIR_2316.
 *
 * Tests the new PDF-returning API: { pdf: Buffer, warnings: string[] }
 * (replaces the Slice-1 structured-object tests).
 *
 * PDF content verification: magic-byte check (%PDF-) + length > 0.
 * Full visual layout verification is a human-review task (see README).
 *
 * Phase 7 note: only LOCKED pay runs contribute to YTD. Unlocked runs
 * are excluded from the aggregate.
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
import { runPayroll, lockPayRun, _resetPayrollSubscriptionsForTests } from '@/modules/payroll/index';
import { _resetEventsForTests } from '@/modules/events/index';
import { seedComplianceRates } from '@/modules/compliance/seed';
import { exportBIR_2316 } from './bir-2316';

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

/** Assert the buffer is a valid PDF (magic-byte check). */
function assertPdf(buf: Buffer) {
  expect(buf).toBeInstanceOf(Buffer);
  expect(buf.length).toBeGreaterThan(0);
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
}

describe('compliance-exports.bir-2316 (Phase 7 — PDF pipeline)', () => {
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

  // ── Happy path: full BIR fields + 2 locked runs → PDF + no field warnings ─
  it('happy path: returns PDF Buffer with no field warnings when BIR fields present and runs locked', async () => {
    const emp = await hr.createEmployee({
      employeeCode: '2316-FULL',
      firstName: 'Juan', lastName: 'Dela Cruz', middleName: 'A',
      basicSalary: 18000, hiredOn: '2026-01-01',
      tinNumber: '123-456-789-000', sssNumber: '0312345677',
    });

    // Set BIR-specific fields
    await db
      .update(employees)
      .set({
        rdoCode:      '044',
        dateOfBirth:  '1990-03-15',
        addressLine1: '123 Main St',
        city:         'Manila',
        province:     'Metro Manila',
        postalCode:   '1000',
      })
      .where(eq(employees.id, emp.id));

    await insertDtr(emp.id, PERIOD_1_DATES);
    const run1 = await runPayroll(PERIOD_1_START, PERIOD_1_END);
    await lockPayRun(run1.id);

    await insertDtr(emp.id, PERIOD_2_DATES);
    const run2 = await runPayroll(PERIOD_2_START, PERIOD_2_END);
    await lockPayRun(run2.id);

    const result = await exportBIR_2316(emp.id, 2026);

    assertPdf(result.pdf);

    // No RDO/DOB/address warnings (all fields set)
    const fieldWarnings = result.warnings.filter(
      (w) => /rdo|birth|address/i.test(w),
    );
    expect(fieldWarnings).toHaveLength(0);
    // No pay-run warning
    expect(result.warnings.some((w) => /no locked/i.test(w))).toBe(false);
  });

  // ── Missing-RDO path ──────────────────────────────────────────────────────
  it('missing-RDO path: returns PDF + warning includes "RDO code missing"', async () => {
    const emp = await hr.createEmployee({
      employeeCode: '2316-NORDO',
      firstName: 'Maria', lastName: 'Santos',
      basicSalary: 18000, hiredOn: '2026-01-01',
      tinNumber: '999-000-000-000',
    });
    // DOB + address but NOT rdoCode
    await db
      .update(employees)
      .set({ dateOfBirth: '1985-07-04', addressLine1: '456 Side St', city: 'Cebu' })
      .where(eq(employees.id, emp.id));

    await insertDtr(emp.id, PERIOD_1_DATES);
    const run = await runPayroll(PERIOD_1_START, PERIOD_1_END);
    await lockPayRun(run.id);

    const result = await exportBIR_2316(emp.id, 2026);

    assertPdf(result.pdf);
    expect(result.warnings.some((w) => /rdo code missing/i.test(w))).toBe(true);
  });

  // ── Zero pay runs ─────────────────────────────────────────────────────────
  it('zero-pay-runs path: returns PDF + warning includes no-locked-runs message', async () => {
    const emp = await hr.createEmployee({
      employeeCode: '2316-NOPAY',
      firstName: 'Pedro', lastName: 'Reyes',
      basicSalary: 18000, hiredOn: '2026-01-01',
      tinNumber: '777-888-999-000',
    });

    const result = await exportBIR_2316(emp.id, 2026);

    assertPdf(result.pdf);
    expect(result.warnings.some((w) => /no locked pay runs/i.test(w))).toBe(true);
  });

  // ── Unlocked run excluded ─────────────────────────────────────────────────
  it('unlocked run is excluded from YTD — triggers no-locked-runs warning', async () => {
    const emp = await hr.createEmployee({
      employeeCode: '2316-UNLOCKED',
      firstName: 'Ana', lastName: 'Garcia',
      basicSalary: 18000, hiredOn: '2026-01-01',
    });

    await insertDtr(emp.id, PERIOD_1_DATES);
    await runPayroll(PERIOD_1_START, PERIOD_1_END); // NOT locked

    const result = await exportBIR_2316(emp.id, 2026);

    assertPdf(result.pdf);
    expect(result.warnings.some((w) => /no locked pay runs/i.test(w))).toBe(true);
  });

  // ── Employee not found ────────────────────────────────────────────────────
  it('throws when employee does not exist', async () => {
    await expect(exportBIR_2316('00000000-0000-0000-0000-000000000000', 2026))
      .rejects.toThrow(/employee not found/i);
  });

  // ── Audit entry written ───────────────────────────────────────────────────
  it('records an audit entry with action compliance.bir2316.exported', async () => {
    const testStart = new Date();

    const emp = await hr.createEmployee({
      employeeCode: '2316-AUD',
      firstName: 'A', lastName: 'B',
      basicSalary: 18000, hiredOn: '2026-01-01',
      tinNumber: '111-222-333-000',
    });

    await insertDtr(emp.id, PERIOD_1_DATES);
    const run = await runPayroll(PERIOD_1_START, PERIOD_1_END);
    await lockPayRun(run.id);

    // actorUserId must be a UUID or null (FK to users.id); pass null in tests.
    await exportBIR_2316(emp.id, 2026);

    // audit_log is append-only (no DELETE); use timestamp filter to isolate.
    const audits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'compliance.bir2316.exported'),
          gte(auditLog.createdAt, testStart),
        ),
      );

    expect(audits.length).toBeGreaterThanOrEqual(1);
    const entry = audits[0]!;
    expect(entry.targetKind).toBe('hr_employee');
    expect(entry.targetId).toBe(emp.id);
  });
});
