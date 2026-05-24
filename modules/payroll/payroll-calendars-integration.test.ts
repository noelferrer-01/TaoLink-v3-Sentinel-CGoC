/**
 * payroll-calendars-integration.test.ts — Phase 6 integration tests.
 *
 * Covers:
 *   6.1 — runPayroll persists dtr_cutoff_date + payday_date on the pay-run row
 *   6.3 — Frozen-dates invariant: calendar mutation does not rewrite past runs
 *
 * Both tests use the global-default calendar (Slice 1 runs have no per-client
 * scope; the sentinel UUID resolves to the global-default calendar row).
 *
 * Cleanup order respects FK constraints:
 *   payslips → pay_runs → dtr_entries → dtr_period_closes →
 *   assignments → detachments → clients → employees → payroll_calendars
 *
 * audit_log is append-only (DB-level trigger blocks DELETE). Tests that need
 * audit assertions filter by createdAt >= testStart captured in beforeEach.
 * event_log has no immutability trigger and is wiped in beforeEach.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { payRuns, payslips } from './schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { detachments, clients } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';
import { eventLog } from '@/modules/events/schema';
import { payrollCalendars as payrollCalendarsTable } from '@/modules/payroll-calendars/schema';
import { hr } from '@/modules/hr/index';
import { seedComplianceRates } from '@/modules/compliance/seed';
import { runPayroll, getPayRun } from './index';
import * as calendars from '@/modules/payroll-calendars/index';
import { _resetPayrollSubscriptionsForTests } from './index';
import { _resetEventsForTests } from '@/modules/events/index';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

async function makeEmployee(code: string) {
  return hr.createEmployee({
    employeeCode: code,
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    basicSalary: 18000,
    hiredOn: '2026-01-01',
    payFrequency: 'SEMI_MONTHLY',
  });
}

async function makeDtrEntries(employeeId: string, dates: string[]) {
  const db = getDb();
  if (dates.length === 0) return;
  await db.insert(dtrEntries).values(
    dates.map((date) => ({ employeeId, date, status: 'worked' as const })),
  );
}

// ─── 6.1 + 6.3 suite ─────────────────────────────────────────────────────────

describe('payroll × payroll-calendars — Phase 6 integration', () => {
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
    await db.delete(payrollCalendarsTable);
  });

  // ─── 6.1: runPayroll captures cut-off + payday dates ─────────────────────
  //
  // Decision: Slice 1 runs are not scoped to a specific client. The service
  // resolves the global-default calendar via the sentinel UUID. When a global-
  // default calendar exists, the resolved dates (cutoff = periodEnd + N days)
  // are persisted onto the pay_run row at creation time.
  it('6.1 — runPayroll persists dtr_cutoff_date + payday_date from global-default calendar', async () => {
    // Create a global-default calendar (clientId = null).
    // cutoff = periodEnd + 3 days, payday = periodEnd + 7 days.
    await calendars.create({
      clientId: null,
      name: 'Global default — Phase 6 test',
      frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 3,
      paydayDaysAfterPeriodEnd: 7,
    });

    const emp = await makeEmployee('CG-CAL001');
    await makeDtrEntries(emp.id, [
      '2026-05-16', '2026-05-17', '2026-05-18',
    ]);

    const run = await runPayroll('2026-05-16', '2026-05-31');
    expect(run.status).toBe('calculated');

    // Verify the dates are populated on the returned run.
    // periodEnd = 2026-05-31; cutoff = 2026-05-31 + 3 = 2026-06-03; payday = 2026-05-31 + 7 = 2026-06-07.
    expect(run.dtrCutoffDate).toBe('2026-06-03');
    expect(run.paydayDate).toBe('2026-06-07');

    // Also verify via a fresh DB read (confirms persistence, not just in-memory).
    const fetched = await getPayRun(run.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.dtrCutoffDate).toBe('2026-06-03');
    expect(fetched!.paydayDate).toBe('2026-06-07');
  });

  it('6.1 — runPayroll falls back to built-in defaults (cutoff+2, payday+5) when no calendar exists', async () => {
    // No calendar created — resolveForPeriod uses fallback-defaults.
    const emp = await makeEmployee('CG-CAL002');
    await makeDtrEntries(emp.id, ['2026-05-16', '2026-05-17']);

    const run = await runPayroll('2026-05-16', '2026-05-31');
    expect(run.status).toBe('calculated');

    // fallback: +2 days cutoff, +5 days payday
    expect(run.dtrCutoffDate).toBe('2026-06-02');
    expect(run.paydayDate).toBe('2026-06-05');
  });

  // ─── 6.3: Frozen-dates invariant ─────────────────────────────────────────
  //
  // After a pay run is created, updating the calendar (e.g. changing
  // dtrCutoffDaysAfterPeriodEnd) MUST NOT change the dates already persisted
  // on the pay_run row. The calendar resolves dates at run-creation time and
  // the values are written as columns — they are snapshots, not live refs.
  it('6.3 — frozen-dates invariant: calendar mutation does not change existing pay-run dates', async () => {
    // Step 1: Create a calendar with cutoff+3, payday+7.
    const cal = await calendars.create({
      clientId: null,
      name: 'Global default — frozen-dates test',
      frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 3,
      paydayDaysAfterPeriodEnd: 7,
    });

    const emp = await makeEmployee('CG-CAL003');
    await makeDtrEntries(emp.id, ['2026-05-16', '2026-05-17']);

    // Step 2: Run payroll — dates are snapshotted from the calendar.
    const run = await runPayroll('2026-05-16', '2026-05-31');
    expect(run.dtrCutoffDate).toBe('2026-06-03');
    expect(run.paydayDate).toBe('2026-06-07');

    // Step 3: Mutate the calendar — change cutoff to +10 days, payday to +14 days.
    await calendars.update(cal.id, {
      dtrCutoffDaysAfterPeriodEnd: 10,
      paydayDaysAfterPeriodEnd: 14,
    });

    // Step 4: Re-fetch the pay run — dates MUST be unchanged.
    // The mutation of the calendar should have no effect on already-persisted runs.
    const refetched = await getPayRun(run.id);
    expect(refetched).not.toBeNull();

    // These must still be the original snapshotted values, not the new +10/+14 values.
    expect(refetched!.dtrCutoffDate).toBe('2026-06-03');  // unchanged — not '2026-06-10'
    expect(refetched!.paydayDate).toBe('2026-06-07');      // unchanged — not '2026-06-14'
  });
});

// Close the shared DB connection once, after all suites in this file finish.
afterAll(async () => {
  await closeDb();
});
