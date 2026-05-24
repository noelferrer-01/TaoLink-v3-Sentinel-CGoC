import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { assignments as assignmentsTable } from './schema';
import { detachments as detachmentsTable, clients as clientsTable } from '@/modules/clients/schema';
import { employees as employeesTable } from '@/modules/hr/schema';
import { dtrEntries, dtrPeriodCloses } from '@/modules/dtr/schema';
import { payslips, payRuns } from '@/modules/payroll/schema';
import { eventLog } from '@/modules/events/schema';
import { hr } from '@/modules/hr/index';
import { clients } from '@/modules/clients/index';
import { assignments } from './index';

// Helper: create a full fixture chain → employee + client + detachment
async function makeFixtures() {
  const employee = await hr.createEmployee({
    employeeCode: 'CG-A001',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    basicSalary: 18000,
    hiredOn: '2026-05-01',
  });
  const client = await clients.createClient({ name: 'Commander Group' });
  const detachment = await clients.createDetachment({ clientId: client.id, name: 'SM Megamall Post' });
  return { employee, client, detachment };
}

describe('assignments module', () => {
  beforeEach(async () => {
    // FK order: payslips → pay_runs → dtr_entries → dtr_period_closes →
    //           assignments → detachments → clients → employees
    await getDb().delete(payslips);
    await getDb().delete(payRuns);
    await getDb().delete(dtrEntries);
    await getDb().delete(dtrPeriodCloses);
    await getDb().delete(assignmentsTable);
    await getDb().delete(detachmentsTable);
    await getDb().delete(clientsTable);
    await getDb().delete(employeesTable);
  });

  afterAll(async () => {
    await closeDb();
  });

  // ─── Test 1: assign creates a row + emits event ────────────────────────────
  it('assign creates an assignment and emits assignments.assignment.created', async () => {
    const { employee, detachment } = await makeFixtures();

    const a = await assignments.assign({
      employeeId: employee.id,
      detachmentId: detachment.id,
      startDate: '2026-05-01',
    });

    expect(a.employeeId).toBe(employee.id);
    expect(a.detachmentId).toBe(detachment.id);
    expect(a.startDate).toBe('2026-05-01');
    expect(a.endDate).toBeNull();
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);

    // Verify event was recorded in event_log
    const db = getDb();
    const rows = await db
      .select()
      .from(eventLog)
      .where(eq(eventLog.topic, 'assignments.assignment.created'));
    const match = rows.filter((r) => (r.payload as Record<string, unknown>)['id'] === a.id);
    expect(match.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Test 2: getActiveAssignment returns active / null before startDate ─────
  it('getActiveAssignment returns the active assignment or null before startDate', async () => {
    const { employee, detachment } = await makeFixtures();

    await assignments.assign({
      employeeId: employee.id,
      detachmentId: detachment.id,
      startDate: '2026-05-01',
    });

    const active = await assignments.getActiveAssignment(employee.id, '2026-05-15');
    expect(active).not.toBeNull();
    expect(active!.employeeId).toBe(employee.id);

    const before = await assignments.getActiveAssignment(employee.id, '2026-04-01');
    expect(before).toBeNull();
  });

  // ─── Test 3: getActiveAssignment returns null after endDate ─────────────────
  it('getActiveAssignment returns null after endDate but still active within window', async () => {
    const { employee, detachment } = await makeFixtures();

    const a = await assignments.assign({
      employeeId: employee.id,
      detachmentId: detachment.id,
      startDate: '2026-05-01',
    });

    await assignments.endAssignment(a.id, '2026-05-10', 'Reassigned', {});

    // After endDate → null
    const afterEnd = await assignments.getActiveAssignment(employee.id, '2026-05-15');
    expect(afterEnd).toBeNull();

    // During window → still returns the assignment
    const duringWindow = await assignments.getActiveAssignment(employee.id, '2026-05-05');
    expect(duringWindow).not.toBeNull();
    expect(duringWindow!.id).toBe(a.id);
  });

  // ─── Test 4: endAssignment sets endDate + endReason + emits event ───────────
  it('endAssignment sets endDate and endReason and emits assignments.assignment.ended', async () => {
    const { employee, detachment } = await makeFixtures();

    const a = await assignments.assign({
      employeeId: employee.id,
      detachmentId: detachment.id,
      startDate: '2026-05-01',
    });

    const ended = await assignments.endAssignment(a.id, '2026-05-20', 'Contract expired', {});

    expect(ended.endDate).toBe('2026-05-20');
    expect(ended.endReason).toBe('Contract expired');

    // Verify event was recorded in event_log
    const db = getDb();
    const rows = await db
      .select()
      .from(eventLog)
      .where(eq(eventLog.topic, 'assignments.assignment.ended'));
    const match = rows.filter((r) => (r.payload as Record<string, unknown>)['id'] === a.id);
    expect(match.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Test 5: Overlap rejection ───────────────────────────────────────────────
  it('assign throws when the employee already has an active assignment', async () => {
    const { employee, detachment } = await makeFixtures();

    // First assignment — open-ended
    await assignments.assign({
      employeeId: employee.id,
      detachmentId: detachment.id,
      startDate: '2026-05-01',
    });

    // Second assign for the same employee should be rejected
    await expect(
      assignments.assign({
        employeeId: employee.id,
        detachmentId: detachment.id,
        startDate: '2026-05-15',
      }),
    ).rejects.toThrow(/already has an active assignment/i);
  });

  // ─── Test 6: listActiveAssignments returns joined rows ────────────────────────
  it('listActiveAssignments returns rows joined with employee + detachment + client', async () => {
    const { employee, detachment } = await makeFixtures();
    await assignments.assign({
      employeeId: employee.id,
      detachmentId: detachment.id,
      startDate: '2026-05-01',
    });

    const rows = await assignments.listActiveAssignments('2026-05-15');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      startDate: '2026-05-01',
      employee: { employeeCode: 'CG-A001', firstName: 'Juan', lastName: 'Dela Cruz' },
      detachment: { name: 'SM Megamall Post' },
      client: { name: 'Commander Group' },
    });
  });

  // ─── Test 7: listActiveAssignments excludes ended ones ────────────────────────
  it('listActiveAssignments excludes assignments whose endDate is before asOf', async () => {
    const { employee, detachment } = await makeFixtures();
    const a = await assignments.assign({
      employeeId: employee.id,
      detachmentId: detachment.id,
      startDate: '2026-05-01',
    });
    await assignments.endAssignment(a.id, '2026-05-10', 'transferred');

    const rows = await assignments.listActiveAssignments('2026-05-15');
    expect(rows).toHaveLength(0);
  });

  // ─── Test 8: listAssignableEmployees excludes already-assigned + terminated ─
  it('listAssignableEmployees excludes employees with an active assignment and terminated ones', async () => {
    const { employee, detachment } = await makeFixtures();
    const free = await hr.createEmployee({
      employeeCode: 'CG-A002', firstName: 'Maria', lastName: 'Santos',
      basicSalary: 18000, hiredOn: '2026-05-01',
    });
    const fired = await hr.createEmployee({
      employeeCode: 'CG-A003', firstName: 'Pedro', lastName: 'Reyes',
      basicSalary: 18000, hiredOn: '2026-05-01',
    });
    await hr.changeStatus(fired.id, 'terminated', 'AWOL');

    await assignments.assign({
      employeeId: employee.id,
      detachmentId: detachment.id,
      startDate: '2026-05-01',
    });

    const rows = await assignments.listAssignableEmployees('2026-05-15');
    expect(rows.map((r) => r.id)).toEqual([free.id]);
  });

  // ─── listAssignmentsOverlappingPeriod ──────────────────────────────────────
  // Regression for the Phase-9 UX-walk bug where the DTR page asked
  // listActiveAssignments(periodStart), excluding assignments that started
  // inside the period. DTR needs *any temporal overlap*, not "active at day 1".
  describe('listAssignmentsOverlappingPeriod', () => {
    const PERIOD_START = '2026-05-16';
    const PERIOD_END = '2026-05-31';

    async function assignOn(startDate: string, endDate?: string) {
      const { employee, detachment } = await makeFixtures();
      const a = await assignments.assign({
        employeeId: employee.id,
        detachmentId: detachment.id,
        startDate,
      });
      if (endDate) {
        await assignments.endAssignment(a.id, endDate, 'test');
      }
      return { a, employee };
    }

    it('includes assignment starting INSIDE the period (the original bug)', async () => {
      const { employee } = await assignOn('2026-05-24'); // started mid-period
      const rows = await assignments.listAssignmentsOverlappingPeriod(PERIOD_START, PERIOD_END);
      expect(rows.map((r) => r.employee.id)).toEqual([employee.id]);
    });

    it('includes assignment that fully spans the period', async () => {
      const { employee } = await assignOn('2026-04-01'); // started before, no end
      const rows = await assignments.listAssignmentsOverlappingPeriod(PERIOD_START, PERIOD_END);
      expect(rows.map((r) => r.employee.id)).toEqual([employee.id]);
    });

    it('includes assignment that ended INSIDE the period', async () => {
      const { employee } = await assignOn('2026-04-01', '2026-05-20'); // ended mid-period
      const rows = await assignments.listAssignmentsOverlappingPeriod(PERIOD_START, PERIOD_END);
      expect(rows.map((r) => r.employee.id)).toEqual([employee.id]);
    });

    it('EXCLUDES assignment that ended before the period', async () => {
      await assignOn('2026-04-01', '2026-05-10'); // fully before
      const rows = await assignments.listAssignmentsOverlappingPeriod(PERIOD_START, PERIOD_END);
      expect(rows).toEqual([]);
    });

    it('EXCLUDES assignment that starts after the period', async () => {
      await assignOn('2026-06-01'); // starts after period end
      const rows = await assignments.listAssignmentsOverlappingPeriod(PERIOD_START, PERIOD_END);
      expect(rows).toEqual([]);
    });
  });
});
