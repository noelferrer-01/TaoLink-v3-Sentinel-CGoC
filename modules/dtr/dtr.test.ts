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

// ─── Billing reader suite ─────────────────────────────────────────────────────
//
// Three functions billing needs:
//   billedDaysByEmployeeDetachment(clientId, start, end)
//   listUnattributedWorkedDays(start, end)
//   reattributeDtrDay(dtrEntryId)
//
// All read the FROZEN dtr_entries.assignment_id — no re-derivation in the
// read paths. Only reattributeDtrDay explicitly calls getActiveAssignment.

import {
  billedDaysByEmployeeDetachment,
  listUnattributedWorkedDays,
  reattributeDtrDay,
} from './index';

describe('dtr module — billing readers', () => {
  const db = getDb();

  beforeEach(async () => {
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

  // ─── Billing fixture helpers ──────────────────────────────────────────────
  // guard A: assigned to Client-X detachment; 4 worked days stamped with that
  //          assignment_id via recordDTR.
  // guard B: no assignment at all → 2 worked days with assignment_id = null.

  async function makeBillingFixtures() {
    // Guard A
    const guardA = await hr.createEmployee({
      employeeCode: 'CG-BILL-A',
      firstName: 'Ana',
      lastName: 'Reyes',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });

    // Guard B — no assignment, intentionally
    const guardB = await hr.createEmployee({
      employeeCode: 'CG-BILL-B',
      firstName: 'Ben',
      lastName: 'Santos',
      basicSalary: 18000,
      hiredOn: '2026-05-01',
    });

    // Client-X with one detachment
    const clientX = await clientsModule.createClient({ name: 'Client-X' });
    const detX = await clientsModule.createDetachment({ clientId: clientX.id, name: 'Client-X Post 1' });

    // Guard A gets assigned to Client-X from May 01
    await assignments.assign({
      employeeId: guardA.id,
      detachmentId: detX.id,
      startDate: '2026-05-01',
    });

    // Record 4 worked days for guard A (assignment_id auto-stamped from active assignment)
    await recordDTR({ employeeId: guardA.id, date: '2026-05-01', status: 'worked' });
    await recordDTR({ employeeId: guardA.id, date: '2026-05-02', status: 'worked' });
    await recordDTR({ employeeId: guardA.id, date: '2026-05-03', status: 'holiday_worked' });
    await recordDTR({ employeeId: guardA.id, date: '2026-05-04', status: 'restday_worked' });

    // Record 2 worked days for guard B (no assignment → assignment_id = null)
    const b1 = await recordDTR({ employeeId: guardB.id, date: '2026-05-01', status: 'worked' });
    const b2 = await recordDTR({ employeeId: guardB.id, date: '2026-05-02', status: 'worked' });

    return { guardA, guardB, clientX, detX, b1, b2 };
  }

  // ─── Test B1: billedDaysByEmployeeDetachment returns 4 days for guard A ───
  it('billedDaysByEmployeeDetachment returns 4 worked days for guard A under Client-X', async () => {
    const { guardA, clientX } = await makeBillingFixtures();

    const rows = await billedDaysByEmployeeDetachment(clientX.id, '2026-05-01', '2026-05-31');

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.employeeId).toBe(guardA.id);
    expect(row.employeeCode).toBe('CG-BILL-A');
    expect(row.firstName).toBe('Ana');
    expect(row.lastName).toBe('Reyes');
    expect(row.days).toBe(4);
  });

  // ─── Test B2: billedDaysByEmployeeDetachment excludes guard B (null assignment) ──
  it('billedDaysByEmployeeDetachment excludes guard B whose assignment_id IS NULL', async () => {
    const { guardB, clientX } = await makeBillingFixtures();

    const rows = await billedDaysByEmployeeDetachment(clientX.id, '2026-05-01', '2026-05-31');

    const bRow = rows.find((r) => r.employeeId === guardB.id);
    expect(bRow).toBeUndefined();
  });

  // ─── Test B3: billedDaysByEmployeeDetachment excludes non-worked statuses ────
  it('billedDaysByEmployeeDetachment excludes absent/leave statuses from the count', async () => {
    const { guardA, clientX } = await makeBillingFixtures();

    // Add a non-worked entry on a new day — should not add to the 4-day total
    await recordDTR({ employeeId: guardA.id, date: '2026-05-05', status: 'absent' });

    const rows = await billedDaysByEmployeeDetachment(clientX.id, '2026-05-01', '2026-05-31');

    const aRow = rows.find((r) => r.employeeId === guardA.id);
    expect(aRow?.days).toBe(4); // still 4, not 5
  });

  // ─── Test B4: listUnattributedWorkedDays returns both of guard B's rows ───
  it('listUnattributedWorkedDays returns B\'s 2 unattributed worked days across ALL clients', async () => {
    const { guardB, b1, b2 } = await makeBillingFixtures();

    const rows = await listUnattributedWorkedDays('2026-05-01', '2026-05-31');

    // Should include both of B's rows
    const bRows = rows.filter((r) => r.employeeId === guardB.id);
    expect(bRows).toHaveLength(2);

    const ids = bRows.map((r) => r.dtrEntryId).sort();
    expect(ids).toEqual([b1.id, b2.id].sort());

    // Row shape check
    const first = bRows[0]!;
    expect(first.employeeCode).toBe('CG-BILL-B');
    expect(first.firstName).toBe('Ben');
    expect(first.lastName).toBe('Santos');
    expect(typeof first.date).toBe('string');
  });

  // ─── Test B5: listUnattributedWorkedDays excludes guard A (has assignment) ─
  it('listUnattributedWorkedDays excludes guard A whose days ARE attributed', async () => {
    const { guardA } = await makeBillingFixtures();

    const rows = await listUnattributedWorkedDays('2026-05-01', '2026-05-31');

    const aRow = rows.find((r) => r.employeeId === guardA.id);
    expect(aRow).toBeUndefined();
  });

  // ─── Test B6: reattributeDtrDay stamps assignment_id + audit, moves to billed ─
  it('reattributeDtrDay stamps assignment_id on a null-assignment row and it moves under its client', async () => {
    const { guardB, clientX, detX, b1 } = await makeBillingFixtures();

    // Verify b1 has no assignment yet
    expect(b1.assignmentId).toBeNull();

    // Give guard B an active assignment covering 2026-05-01
    await assignments.assign({
      employeeId: guardB.id,
      detachmentId: detX.id,
      startDate: '2026-05-01',
    });

    // Re-attribute b1
    const updated = await reattributeDtrDay(b1.id);
    expect(updated.assignmentId).not.toBeNull();

    // b1 must now appear in billedDaysByEmployeeDetachment for Client-X
    const billed = await billedDaysByEmployeeDetachment(clientX.id, '2026-05-01', '2026-05-31');
    const bRow = billed.find((r) => r.employeeId === guardB.id);
    expect(bRow).toBeDefined();
    expect(bRow!.days).toBe(1);

    // b1 must NOT appear in listUnattributedWorkedDays anymore
    const unattributed = await listUnattributedWorkedDays('2026-05-01', '2026-05-31');
    const stillUnattributed = unattributed.find((r) => r.dtrEntryId === b1.id);
    expect(stillUnattributed).toBeUndefined();
  });

  // ─── Test B7: reattributeDtrDay throws when no active assignment ─────────
  it('reattributeDtrDay throws with a plain-language error when no active assignment covers the date', async () => {
    const { b1 } = await makeBillingFixtures();

    // Guard B still has no assignment → should throw
    await expect(reattributeDtrDay(b1.id)).rejects.toThrow(/assign the guard first/i);
  });

  // ─── Test B8: reattributeDtrDay throws for a non-existent entry id ───────
  it('reattributeDtrDay throws when the dtr entry does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    await expect(reattributeDtrDay(fakeId)).rejects.toThrow(/no entry/i);
  });
});

// Close the shared DB connection once, after all suites in this file finish.
afterAll(async () => {
  await closeDb();
});
