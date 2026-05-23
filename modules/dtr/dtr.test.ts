import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { dtrEntries, dtrPeriodCloses } from './schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { detachments, clients } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';
import { eventLog } from '@/modules/events/schema';
import { hr } from '@/modules/hr/index';
import { clients as clientsModule } from '@/modules/clients/index';
import { assignments } from '@/modules/assignments/index';
import { recordDTR, getDTR, closePeriod } from './index';

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
    // FK order: dtr_entries → dtr_period_closes → assignments → detachments → clients → employees
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
});
