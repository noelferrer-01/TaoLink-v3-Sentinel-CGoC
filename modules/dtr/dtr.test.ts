import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq, gte } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { dtrEntries, dtrPeriodCloses } from './schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { detachments, clients } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';
import { persons } from '@/modules/persons/schema';
import { payslips, payRuns } from '@/modules/payroll/schema';
import { eventLog } from '@/modules/events/schema';
import { auditLog } from '@/modules/audit/schema';
import { payrollCalendars as payrollCalendarsTable } from '@/modules/payroll-calendars/schema';
import { hr } from '@/modules/hr/index';
import { clients as clientsModule } from '@/modules/clients/index';
import { assignments } from '@/modules/assignments/index';
import * as calendars from '@/modules/payroll-calendars/index';
import {
  recordDTR,
  getDTR,
  closePeriod,
  isPeriodClosed,
  summarizePeriod,
  bulkFillWorked,
  WORKED_DTR_STATUSES,
} from './index';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

async function makeEmployee(code: string) {
  return hr.createEmployee({
    employeeCode: code,
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    basicSalary: 18000,
    hiredOn: '2026-05-01',
  });
}

async function makeFixtures() {
  const employee = await makeEmployee('CG-D001');
  const client = await clientsModule.createClient({ name: 'Commander Group' });
  const detachment = await clientsModule.createDetachment({ clientId: client.id, name: 'SM Megamall Post' });
  const assignment = await assignments.assign({
    employeeId: employee.id,
    detachmentId: detachment.id,
    startDate: '2026-05-01',
  });
  return { employee, client, detachment, assignment };
}

describe('dtr module', () => {
  const db = getDb();

  beforeEach(async () => {
    // FK order: payslips → pay_runs → dtr_entries → dtr_period_closes →
    //           assignments → detachments → clients → employees
    await db.delete(payslips);
    await db.delete(payRuns);
    await db.delete(dtrEntries);
    await db.delete(dtrPeriodCloses);
    await db.delete(assignmentsTable);
    await db.delete(detachments);
    await db.delete(clients);
    await db.delete(employees);
    await db.delete(persons);
  });

  // Note: closeDb() is called once at file level below (after all suites).

  // ─── Test 1: recordDTR auto-resolves assignmentId ─────────────────────────
  it('recordDTR happy path auto-resolves assignmentId from getActiveAssignment', async () => {
    const { employee, assignment } = await makeFixtures();

    const entry = await recordDTR({ employeeId: employee.id, date: '2026-05-15' });

    expect(entry.assignmentId).toBe(assignment.id);
    expect(entry.status).toBe('worked');
  });

  // ─── Test 2: recordDTR with no assignment leaves assignmentId null ────────
  it('recordDTR with no active assignment leaves assignmentId null', async () => {
    const employee = await makeEmployee('CG-D002');

    const entry = await recordDTR({ employeeId: employee.id, date: '2026-05-15' });

    expect(entry.assignmentId).toBeNull();
  });

  // ─── Test 3: Duplicate (employee, date) throws plain-language error ───────
  it('duplicate (employee, date) throws plain-language error with the date', async () => {
    const { employee } = await makeFixtures();

    await recordDTR({ employeeId: employee.id, date: '2026-05-15' });

    await expect(
      recordDTR({ employeeId: employee.id, date: '2026-05-15' }),
    ).rejects.toThrow(/already exists/i);

    await expect(
      recordDTR({ employeeId: employee.id, date: '2026-05-15' }),
    ).rejects.toThrow('2026-05-15');
  });

  // ─── Test 4: getDTR returns rows in range, inclusive ─────────────────────
  it('getDTR returns rows in range, inclusive on both ends', async () => {
    const { employee } = await makeFixtures();

    await recordDTR({ employeeId: employee.id, date: '2026-05-14' });
    await recordDTR({ employeeId: employee.id, date: '2026-05-15' });
    await recordDTR({ employeeId: employee.id, date: '2026-05-16' });

    const twoRows = await getDTR(employee.id, '2026-05-15', '2026-05-16');
    expect(twoRows).toHaveLength(2);

    const threeRows = await getDTR(employee.id, '2026-05-14', '2026-05-16');
    expect(threeRows).toHaveLength(3);
  });

  // ─── Test 5: closePeriod emits dtr.period.closed ─────────────────────────
  it('closePeriod emits dtr.period.closed into event_log', async () => {
    await closePeriod('2026-05-01', '2026-05-15');

    const rows = await db
      .select()
      .from(eventLog)
      .where(eq(eventLog.topic, 'dtr.period.closed'));

    const match = rows.filter((r) => {
      const p = r.payload as Record<string, unknown>;
      return p['periodStart'] === '2026-05-01' && p['periodEnd'] === '2026-05-15';
    });
    expect(match.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Test 6: Closing same period twice throws plain-language error ────────
  it('closing the same period twice throws plain-language error', async () => {
    await closePeriod('2026-05-01', '2026-05-15');

    await expect(
      closePeriod('2026-05-01', '2026-05-15'),
    ).rejects.toThrow(/already closed/i);
  });

  // ─── Test 7: isPeriodClosed reflects period_closes table ──────────────────
  it('isPeriodClosed returns true after the period is closed, false before', async () => {
    expect(await isPeriodClosed('2026-06-01', '2026-06-15')).toBe(false);
    await closePeriod('2026-06-01', '2026-06-15');
    expect(await isPeriodClosed('2026-06-01', '2026-06-15')).toBe(true);
    // A different period stays open.
    expect(await isPeriodClosed('2026-06-16', '2026-06-30')).toBe(false);
  });

  // ─── Test 8: summarizePeriod counts recorded days per employee ────────────
  it('summarizePeriod returns counts for each employee with entries in range', async () => {
    const { employee } = await makeFixtures();
    const employee2 = await makeEmployee('CG-D002');

    await recordDTR({ employeeId: employee.id, date: '2026-05-01' });
    await recordDTR({ employeeId: employee.id, date: '2026-05-02' });
    await recordDTR({ employeeId: employee.id, date: '2026-05-03' });
    await recordDTR({ employeeId: employee2.id, date: '2026-05-01' });
    // Outside the period; should not count.
    await recordDTR({ employeeId: employee.id, date: '2026-05-20' });

    const summary = await summarizePeriod(
      [employee.id, employee2.id],
      '2026-05-01',
      '2026-05-15',
    );
    const byId = new Map(summary.map((s) => [s.employeeId, s.recordedDays]));
    expect(byId.get(employee.id)).toBe(3);
    expect(byId.get(employee2.id)).toBe(1);
  });

  // ─── Test 10: WORKED_DTR_STATUSES is the canonical worked-day set ───────────
  it('WORKED_DTR_STATUSES is the canonical worked-day set', () => {
    expect([...WORKED_DTR_STATUSES].sort()).toEqual(['holiday_worked', 'restday_worked', 'worked']);
  });

  // ─── Test 9: bulkFillWorked records every missing day in range ────────────
  it('bulkFillWorked fills missing days as worked and skips already-recorded ones', async () => {
    const { employee } = await makeFixtures();

    // Pre-existing entry for the 3rd — should be skipped.
    await recordDTR({ employeeId: employee.id, date: '2026-05-03', status: 'absent' });

    const result = await bulkFillWorked(employee.id, '2026-05-01', '2026-05-05');
    expect(result.recorded).toBe(4);
    expect(result.skipped).toBe(1);

    const rows = await getDTR(employee.id, '2026-05-01', '2026-05-05');
    expect(rows).toHaveLength(5);
    // The pre-existing absent entry stays absent.
    const may3 = rows.find((r) => r.date === '2026-05-03');
    expect(may3?.status).toBe('absent');
    // Filled days are worked with the default time window.
    const may1 = rows.find((r) => r.date === '2026-05-01');
    expect(may1?.status).toBe('worked');
    expect(may1?.timeIn).toBe('07:00:00');
    expect(may1?.timeOut).toBe('15:00:00');
  });
});

// ─── 6.2: Late-DTR-close warning suite ───────────────────────────────────────
//
// Decision: closePeriod is period-wide (no client parameter). The late-warning
// logic resolves the global-default calendar via the sentinel UUID and compares
// now() to dtrCutoffDate. A _nowOverride test hook is used to control "now"
// without sleeping or manipulating real clocks.
//
// The warning MUST NOT block the close (the period_closes row is still created).
// The warning emits:
//   - event: dtr.period.closed.late
//   - audit action: dtr.period.closed.late

describe('dtr module — 6.2 late-DTR-close warning', () => {
  const db = getDb();
  let testStart: Date;

  beforeEach(async () => {
    testStart = new Date();

    await db.delete(payslips);
    await db.delete(payRuns);
    await db.delete(dtrEntries);
    await db.delete(dtrPeriodCloses);
    await db.delete(assignmentsTable);
    await db.delete(detachments);
    await db.delete(clients);
    await db.delete(employees);
    await db.delete(persons);
    await db.delete(eventLog);
    await db.delete(payrollCalendarsTable);
  });

  // ─── Test 6.2a: Closing on time → no late warning ────────────────────────
  it('closing before the DTR cut-off does NOT emit dtr.period.closed.late', async () => {
    // Global-default: cutoff = periodEnd + 3 days (2026-05-31 + 3 = 2026-06-03)
    await calendars.create({
      clientId: null,
      name: 'On-time test calendar',
      frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 3,
      paydayDaysAfterPeriodEnd: 7,
    });

    // Simulate "now" = 2026-06-01, which is before the cut-off 2026-06-03.
    const nowBeforeCutoff = new Date('2026-06-01T10:00:00Z');
    await closePeriod('2026-05-16', '2026-05-31', { _nowOverride: nowBeforeCutoff });

    // The normal dtr.period.closed event must still be emitted.
    const periodClosedEvents = await db
      .select()
      .from(eventLog)
      .where(eq(eventLog.topic, 'dtr.period.closed'));
    expect(periodClosedEvents.length).toBeGreaterThanOrEqual(1);

    // No late-warning event should be in the log.
    const lateEvents = await db
      .select()
      .from(eventLog)
      .where(eq(eventLog.topic, 'dtr.period.closed.late'));
    expect(lateEvents).toHaveLength(0);
  });

  // ─── Test 6.2b: Closing late → emits warning + audit, does NOT block ─────
  it('closing after the DTR cut-off emits dtr.period.closed.late event + audit, period is still closed', async () => {
    // Global-default: cutoff = periodEnd + 3 days (2026-05-31 + 3 = 2026-06-03)
    await calendars.create({
      clientId: null,
      name: 'Late-close test calendar',
      frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 3,
      paydayDaysAfterPeriodEnd: 7,
    });

    // Simulate "now" = 2026-06-10, well past the cut-off 2026-06-03.
    const nowPastCutoff = new Date('2026-06-10T10:00:00Z');
    await closePeriod('2026-05-16', '2026-05-31', { _nowOverride: nowPastCutoff });

    // ── The close itself must still succeed ──────────────────────────────────
    // dtr_period_closes should have the row.
    const closedRow = await db
      .select()
      .from(dtrPeriodCloses)
      .where(
        eq(dtrPeriodCloses.periodStart, '2026-05-16'),
      );
    expect(closedRow.length).toBeGreaterThanOrEqual(1);

    // ── Late warning event must be emitted ───────────────────────────────────
    const lateEvents = await db
      .select()
      .from(eventLog)
      .where(eq(eventLog.topic, 'dtr.period.closed.late'));
    expect(lateEvents).toHaveLength(1);

    const latePayload = lateEvents[0]!.payload as Record<string, unknown>;
    expect(latePayload['periodStart']).toBe('2026-05-16');
    expect(latePayload['periodEnd']).toBe('2026-05-31');
    // The payload must include the cut-off date and calendarSource.
    expect(typeof latePayload['dtrCutoffDate']).toBe('string');
    expect(latePayload['calendarSource']).toBe('global-default');

    // ── Late warning audit record must be written ────────────────────────────
    // audit_log is append-only; filter by testStart to isolate this test.
    const lateAudit = await db
      .select()
      .from(auditLog)
      .where(
        gte(auditLog.createdAt, testStart),
      );
    const lateAuditRow = lateAudit.find((r) => r.action === 'dtr.period.closed.late');
    expect(lateAuditRow).toBeDefined();
    expect((lateAuditRow!.payload as Record<string, unknown>)['periodStart']).toBe('2026-05-16');
  });

  // ─── Test 6.2c: No calendar at all → fallback-defaults, still warns if late
  it('without any calendar, fallback-defaults apply; late warning emitted if past fallback cutoff', async () => {
    // No calendar created. Fallback: cutoff = periodEnd + 2 days = 2026-06-02.
    // Simulate "now" = 2026-06-05, which is past 2026-06-02.
    const nowPastFallback = new Date('2026-06-05T10:00:00Z');
    await closePeriod('2026-05-16', '2026-05-31', { _nowOverride: nowPastFallback });

    const lateEvents = await db
      .select()
      .from(eventLog)
      .where(eq(eventLog.topic, 'dtr.period.closed.late'));
    expect(lateEvents).toHaveLength(1);

    const payload = lateEvents[0]!.payload as Record<string, unknown>;
    expect(payload['calendarSource']).toBe('fallback-defaults');
  });
});

// Close the shared DB connection once, after all suites in this file finish.
afterAll(async () => {
  await closeDb();
});
