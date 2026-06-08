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

    const { rows, total } = await assignments.listActiveAssignments('2026-05-15');
    expect(rows).toHaveLength(1);
    expect(total).toBe(1);
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

    const { rows, total } = await assignments.listActiveAssignments('2026-05-15');
    expect(rows).toHaveLength(0);
    expect(total).toBe(0);
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

  // ─── bulkAssign ───────────────────────────────────────────────────────────
  describe('bulkAssign', () => {
    it('assigns multiple employees and returns all in assigned[]', async () => {
      const { detachment } = await makeFixtures(); // creates 1st employee too
      const emp2 = await hr.createEmployee({
        employeeCode: 'CG-B002', firstName: 'Ana', lastName: 'Garcia',
        basicSalary: 18000, hiredOn: '2026-05-01',
      });
      const emp3 = await hr.createEmployee({
        employeeCode: 'CG-B003', firstName: 'Lito', lastName: 'Bautista',
        basicSalary: 18000, hiredOn: '2026-05-01',
      });

      const result = await assignments.bulkAssign(
        [emp2.id, emp3.id],
        detachment.id,
        '2026-06-01',
      );

      expect(result.assigned).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.assigned.every((a) => a.detachmentId === detachment.id)).toBe(true);
      expect(result.assigned.every((a) => a.startDate === '2026-06-01')).toBe(true);
    });

    it('collects errors for invalid employeeIds without aborting the batch', async () => {
      const { detachment } = await makeFixtures();
      const emp2 = await hr.createEmployee({
        employeeCode: 'CG-B004', firstName: 'Rosie', lastName: 'Cruz',
        basicSalary: 18000, hiredOn: '2026-05-01',
      });

      const fakeId = '00000000-0000-0000-0000-000000000001';
      const result = await assignments.bulkAssign(
        [emp2.id, fakeId],
        detachment.id,
        '2026-06-01',
      );

      // emp2 succeeds; fakeId triggers FK violation (or similar)
      expect(result.assigned).toHaveLength(1);
      expect(result.assigned[0]!.employeeId).toBe(emp2.id);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.employeeId).toBe(fakeId);
    });

    it('returns error (not throw) when employee already has active assignment', async () => {
      const { employee, detachment } = await makeFixtures();
      // employee already has active assignment from makeFixtures? No — makeFixtures
      // just creates them without assigning. Assign first:
      await assignments.assign({
        employeeId: employee.id,
        detachmentId: detachment.id,
        startDate: '2026-05-01',
      });

      const result = await assignments.bulkAssign(
        [employee.id],
        detachment.id,
        '2026-06-01',
      );

      expect(result.assigned).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.reason).toMatch(/already has an active assignment/i);
    });
  });

  // ─── bulkEndAssignments ───────────────────────────────────────────────────
  describe('bulkEndAssignments', () => {
    it('ends multiple assignments and returns them in ended[]', async () => {
      const { employee, detachment } = await makeFixtures();
      const emp2 = await hr.createEmployee({
        employeeCode: 'CG-C002', firstName: 'Rina', lastName: 'Mendoza',
        basicSalary: 18000, hiredOn: '2026-05-01',
      });

      const a1 = await assignments.assign({
        employeeId: employee.id, detachmentId: detachment.id, startDate: '2026-05-01',
      });
      const a2 = await assignments.assign({
        employeeId: emp2.id, detachmentId: detachment.id, startDate: '2026-05-01',
      });

      const result = await assignments.bulkEndAssignments(
        [a1.id, a2.id],
        '2026-05-31',
        'Contract expired',
      );

      expect(result.ended).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.ended.every((a) => a.endDate === '2026-05-31')).toBe(true);
    });

    it('collects errors for unknown ids without aborting the batch', async () => {
      const { employee, detachment } = await makeFixtures();
      const a = await assignments.assign({
        employeeId: employee.id, detachmentId: detachment.id, startDate: '2026-05-01',
      });

      const fakeId = '00000000-0000-0000-0000-000000000002';
      const result = await assignments.bulkEndAssignments(
        [a.id, fakeId],
        '2026-05-31',
        'test',
      );

      expect(result.ended).toHaveLength(1);
      expect(result.ended[0]!.id).toBe(a.id);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.assignmentId).toBe(fakeId);
    });
  });

  // ─── bulkTransfer ─────────────────────────────────────────────────────────
  describe('bulkTransfer', () => {
    it('transfers an employee: ends old assignment, creates new one', async () => {
      const { employee, detachment } = await makeFixtures();
      const client2 = await clients.createClient({ name: 'Client B' });
      const det2 = await clients.createDetachment({ clientId: client2.id, name: 'Post B' });

      await assignments.assign({
        employeeId: employee.id, detachmentId: detachment.id, startDate: '2026-05-01',
      });

      const result = await assignments.bulkTransfer(
        [employee.id],
        det2.id,
        '2026-06-01',
      );

      expect(result.transferred).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      const newA = result.transferred[0]!;
      expect(newA.detachmentId).toBe(det2.id);
      expect(newA.startDate).toBe('2026-06-01');

      // Old assignment should be ended at 2026-05-31
      const old = await assignments.getActiveAssignment(employee.id, '2026-05-15');
      expect(old).not.toBeNull();
      expect(old!.endDate).toBe('2026-05-31');
    });

    it('returns error when employee has no active assignment', async () => {
      const { employee } = await makeFixtures();
      // no assign — just a bare employee
      const fakeDetId = '00000000-0000-0000-0000-000000000003';

      const result = await assignments.bulkTransfer(
        [employee.id],
        fakeDetId,
        '2026-06-01',
      );

      expect(result.transferred).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.reason).toMatch(/no active assignment/i);
    });

    it('mid-batch failure does not affect other employees in the batch', async () => {
      const { employee, detachment } = await makeFixtures();
      const emp2 = await hr.createEmployee({
        employeeCode: 'CG-D002', firstName: 'Mario', lastName: 'Ramos',
        basicSalary: 18000, hiredOn: '2026-05-01',
      });
      const client2 = await clients.createClient({ name: 'Client C' });
      const det2 = await clients.createDetachment({ clientId: client2.id, name: 'Post C' });

      // Only emp2 has an active assignment; employee does NOT
      await assignments.assign({
        employeeId: emp2.id, detachmentId: detachment.id, startDate: '2026-05-01',
      });

      const result = await assignments.bulkTransfer(
        [employee.id, emp2.id], // employee will fail, emp2 will succeed
        det2.id,
        '2026-06-01',
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.employeeId).toBe(employee.id);
      expect(result.transferred).toHaveLength(1);
      expect(result.transferred[0]!.employeeId).toBe(emp2.id);
    });
  });

  // ─── updateAssignment ─────────────────────────────────────────────────────
  describe('updateAssignment', () => {
    it('updates mutable fields (startDate, endDate, reason)', async () => {
      const { employee, detachment } = await makeFixtures();
      const a = await assignments.assign({
        employeeId: employee.id, detachmentId: detachment.id, startDate: '2026-05-01',
      });

      const updated = await assignments.updateAssignment(a.id, {
        startDate: '2026-05-05',
        endDate: '2026-06-30',
        reason: 'Contract adjustment',
      });

      expect(updated.startDate).toBe('2026-05-05');
      expect(updated.endDate).toBe('2026-06-30');
      expect(updated.endReason).toBe('Contract adjustment');
      // Immutable fields unchanged
      expect(updated.employeeId).toBe(employee.id);
      expect(updated.detachmentId).toBe(detachment.id);
    });

    it('silently ignores immutable fields passed in patch (they are not in the type)', async () => {
      const { employee, detachment } = await makeFixtures();
      const a = await assignments.assign({
        employeeId: employee.id, detachmentId: detachment.id, startDate: '2026-05-01',
      });

      // UpdateAssignmentPatch only allows startDate/endDate/reason —
      // passing anything else requires a cast and won't reach DB.
      const updated = await assignments.updateAssignment(a.id, {
        startDate: '2026-05-10',
        // Deliberately pass only safe fields
      });

      expect(updated.startDate).toBe('2026-05-10');
      expect(updated.employeeId).toBe(employee.id);
    });

    it('throws when assignment id does not exist', async () => {
      await expect(
        assignments.updateAssignment('00000000-0000-0000-0000-000000000099', {
          startDate: '2026-06-01',
        }),
      ).rejects.toThrow(/no assignment/i);
    });
  });

  // ─── list (paginated) ─────────────────────────────────────────────────────
  describe('list (paginated)', () => {
    async function seedN(n: number) {
      // Need distinct employees (one per assignment, no overlap violations)
      const { employee, detachment } = await makeFixtures(); // creates CG-A001 + detachment

      const allIds: string[] = [employee.id];
      // Create n-1 more employees (total n with the makeFixtures employee).
      // makeFixtures employee is CG-A001; we create CG-P002 … CG-P{n}.
      for (let i = 2; i <= n; i++) {
        const code = `CG-P${String(i).padStart(3, '0')}`;
        const emp = await hr.createEmployee({
          employeeCode: code,
          firstName: `First${i}`,
          lastName: `Last${i}`,
          basicSalary: 18000,
          hiredOn: '2026-05-01',
        });
        allIds.push(emp.id);
      }

      // Assign each employee to the detachment once. Using the IDs we just
      // created avoids the previous bug where re-fetching "first employee"
      // via .limit(1) (no ORDER BY) was nondeterministic — sometimes it
      // returned an ID already in the list and the second assign() threw
      // on the overlap rule. (CI hit this; local order happened to be lucky.)
      for (let i = 0; i < allIds.length; i++) {
        await assignments.assign({
          employeeId: allIds[i]!,
          detachmentId: detachment.id,
          startDate: '2026-05-01',
        });
      }

      return { detachment };
    }

    it('returns first page of 10 and total=50', async () => {
      await seedN(50);
      const result = await assignments.list({ limit: 10, offset: 0 });
      expect(result.rows).toHaveLength(10);
      expect(result.total).toBe(50);
    });

    it('returns last page (offset=40, limit=10) with 10 rows', async () => {
      await seedN(50);
      const result = await assignments.list({ limit: 10, offset: 40 });
      expect(result.rows).toHaveLength(10);
      expect(result.total).toBe(50);
    });

    it('defaults to limit=50 with no options', async () => {
      await seedN(50);
      const result = await assignments.list();
      expect(result.rows).toHaveLength(50);
      expect(result.total).toBe(50);
    });
  });
});
