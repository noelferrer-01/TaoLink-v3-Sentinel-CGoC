import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { dtrEntries, dtrPeriodCloses } from './schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { detachments, clients } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';
import { payslips, payRuns } from '@/modules/payroll/schema';
import { eventLog } from '@/modules/events/schema';
import { hr } from '@/modules/hr/index';
import { clients as clientsModule } from '@/modules/clients/index';
import { assignments } from '@/modules/assignments/index';
import {
  recordDTR,
  getDTR,
  closePeriod,
  isPeriodClosed,
  summarizePeriod,
  bulkFillWorked,
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
  });

  afterAll(async () => {
    await closeDb();
  });

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
