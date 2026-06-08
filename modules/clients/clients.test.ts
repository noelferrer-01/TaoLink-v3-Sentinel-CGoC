import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from '@/core/db';
import { clients as clientsTable, detachments as detachmentsTable } from './schema';
import { auditLog } from '@/modules/audit/schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { employees as employeesTable } from '@/modules/hr/schema';
import { payrollCalendars as payrollCalendarsTable } from '@/modules/payroll-calendars/schema';
import { clients } from './index';
import { hr } from '@/modules/hr/index';
import { assignments } from '@/modules/assignments/index';
import { create as createPayrollCalendar } from '@/modules/payroll-calendars/index';

describe('clients module', () => {
  beforeEach(async () => {
    // FK order: assignments → detachments → clients → payroll_calendars → employees
    // (clients.default_payroll_calendar_id references payroll_calendars.id,
    //  so clients must be deleted before payroll_calendars)
    await getDb().delete(assignmentsTable);
    await getDb().delete(detachmentsTable);
    await getDb().delete(clientsTable);
    await getDb().delete(payrollCalendarsTable);
    await getDb().delete(employeesTable);
  });
  afterAll(async () => { await closeDb(); });

  it('createClient creates a client with the provided fields', async () => {
    const c = await clients.createClient({
      name: 'Commander Group of Companies',
      contactEmail: 'info@commander.com.ph',
      contactPhone: '+63 2 1234 5678',
    });
    expect(c.name).toBe('Commander Group of Companies');
    expect(c.contactEmail).toBe('info@commander.com.ph');
    expect(c.contactPhone).toBe('+63 2 1234 5678');
    expect(c.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(c.createdAt).toBeInstanceOf(Date);
  });

  it('createDetachment creates a detachment linked to a client', async () => {
    const c = await clients.createClient({ name: 'Test Corp' });
    const d = await clients.createDetachment({ clientId: c.id, name: 'SM Megamall Post' });
    expect(d.clientId).toBe(c.id);
    expect(d.name).toBe('SM Megamall Post');
    expect(d.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(d.createdAt).toBeInstanceOf(Date);
  });

  it('createDetachment rejects non-existent clientId with a plain-language error', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000001';
    await expect(
      clients.createDetachment({ clientId: fakeId, name: 'Ghost Post' }),
    ).rejects.toThrow(/client/i);
    await expect(
      clients.createDetachment({ clientId: fakeId, name: 'Ghost Post' }),
    ).rejects.toThrow(/exist/i);
  });

  it('getDetachment returns null for unknown id', async () => {
    const result = await clients.getDetachment('00000000-0000-4000-8000-000000000002');
    expect(result).toBeNull();
  });

  it('getDetachment returns the row by id', async () => {
    const c = await clients.createClient({ name: 'Fetch Corp' });
    const d = await clients.createDetachment({ clientId: c.id, name: 'North Gate' });
    const fetched = await clients.getDetachment(d.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(d.id);
    expect(fetched!.name).toBe('North Gate');
    expect(fetched!.clientId).toBe(c.id);
  });

  it('listDetachments returns detachments for a client, in creation order', async () => {
    const c = await clients.createClient({ name: 'List Corp' });
    const d1 = await clients.createDetachment({ clientId: c.id, name: 'Alpha Post' });
    const d2 = await clients.createDetachment({ clientId: c.id, name: 'Beta Post' });
    const list = await clients.listDetachments(c.id);
    expect(list).toHaveLength(2);
    expect(list[0]!.id).toBe(d1.id);
    expect(list[1]!.id).toBe(d2.id);
  });

  it('listClients returns clients sorted by name', async () => {
    await clients.createClient({ name: 'Zeta Holdings' });
    await clients.createClient({ name: 'Alpha Corp' });
    await clients.createClient({ name: 'Mu Industries' });
    const list = await clients.listClients();
    expect(list.map((c) => c.name)).toEqual(['Alpha Corp', 'Mu Industries', 'Zeta Holdings']);
  });

  it('listClientsPage paginates + reports total', async () => {
    for (let i = 1; i <= 5; i++) {
      await clients.createClient({ name: `Client ${String(i).padStart(2, '0')}` });
    }
    const page1 = await clients.listClientsPage({ limit: 2, offset: 0 });
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.rows.map((c) => c.name)).toEqual(['Client 01', 'Client 02']);

    const page3 = await clients.listClientsPage({ limit: 2, offset: 4 });
    expect(page3.rows).toHaveLength(1);
    expect(page3.total).toBe(5);
    expect(page3.rows[0]!.name).toBe('Client 05');
  });

  it('listDetachmentsWithDeploymentPage paginates and respects clientId filter', async () => {
    const cA = await clients.createClient({ name: 'A Corp' });
    const cB = await clients.createClient({ name: 'B Corp' });
    for (let i = 1; i <= 3; i++) {
      await clients.createDetachment({ clientId: cA.id, name: `A-Post-${i}` });
    }
    for (let i = 1; i <= 2; i++) {
      await clients.createDetachment({ clientId: cB.id, name: `B-Post-${i}` });
    }

    const filteredA = await clients.listDetachmentsWithDeploymentPage({ clientId: cA.id, limit: 10 });
    expect(filteredA.total).toBe(3);
    expect(filteredA.rows).toHaveLength(3);
    expect(filteredA.rows.every((d) => d.clientId === cA.id)).toBe(true);

    const all = await clients.listDetachmentsWithDeploymentPage({ limit: 10 });
    expect(all.total).toBe(5);

    const slice = await clients.listDetachmentsWithDeploymentPage({ limit: 2, offset: 2 });
    expect(slice.rows).toHaveLength(2);
    expect(slice.total).toBe(5);
  });

  it('getClient returns null for unknown id', async () => {
    const result = await clients.getClient('00000000-0000-4000-8000-000000000003');
    expect(result).toBeNull();
  });

  it('getClient returns the row by id', async () => {
    const c = await clients.createClient({ name: 'Get Corp' });
    const fetched = await clients.getClient(c.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(c.id);
    expect(fetched!.name).toBe('Get Corp');
  });

  it('listClientsWithDetachments groups detachments under their clients, sorted by name', async () => {
    const cZ = await clients.createClient({ name: 'Zeta Holdings' });
    const cA = await clients.createClient({ name: 'Alpha Corp' });
    await clients.createDetachment({ clientId: cA.id, name: 'Beta Post' });
    await clients.createDetachment({ clientId: cA.id, name: 'Alpha Post' });
    await clients.createDetachment({ clientId: cZ.id, name: 'Zulu Post' });

    const grouped = await clients.listClientsWithDetachments();
    expect(grouped.map((g) => g.name)).toEqual(['Alpha Corp', 'Zeta Holdings']);
    expect(grouped[0]!.detachments.map((d) => d.name)).toEqual(['Alpha Post', 'Beta Post']);
    expect(grouped[1]!.detachments.map((d) => d.name)).toEqual(['Zulu Post']);
  });

  it('listClientsWithDetachments includes clients that have zero detachments', async () => {
    await clients.createClient({ name: 'Empty Corp' });
    const grouped = await clients.listClientsWithDetachments();
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.detachments).toEqual([]);
  });

  // ─── 4.1: updateClient ────────────────────────────────────────────────────

  it('updateClient: happy path — updates mutable fields and returns updated row', async () => {
    const c = await clients.createClient({ name: 'Old Name', contactEmail: 'old@example.com' });
    const updated = await clients.updateClient(c.id, { name: 'New Name', contactEmail: 'new@example.com' });
    expect(updated.id).toBe(c.id);
    expect(updated.name).toBe('New Name');
    expect(updated.contactEmail).toBe('new@example.com');
    // createdAt is unchanged
    expect(updated.createdAt.toISOString()).toBe(c.createdAt.toISOString());
  });

  it('updateClient: immutable fields (id, createdAt) in patch are silently ignored', async () => {
    const c = await clients.createClient({ name: 'Stable Corp' });
    const fakeId = '00000000-0000-4000-8000-000000000099';
    // Pass id and createdAt as part of patch — they should be stripped
    const updated = await clients.updateClient(c.id, {
      name: 'Stable Corp Renamed',
      id: fakeId as unknown as string,
      createdAt: new Date('2000-01-01') as unknown as Date,
    } as Parameters<typeof clients.updateClient>[1]);
    expect(updated.id).toBe(c.id);           // id unchanged
    expect(updated.name).toBe('Stable Corp Renamed');
  });

  it('updateClient: throws when id not found', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000011';
    await expect(clients.updateClient(fakeId, { name: 'Ghost' })).rejects.toThrow(/not found/i);
  });

  // ─── 4.1: updateDetachment ────────────────────────────────────────────────

  it('updateDetachment: happy path — updates mutable fields and returns updated row', async () => {
    const c = await clients.createClient({ name: 'Patch Client' });
    const d = await clients.createDetachment({ clientId: c.id, name: 'Old Post', requiredHeadcount: 5 });
    const updated = await clients.updateDetachment(d.id, { name: 'New Post', requiredHeadcount: 10 });
    expect(updated.id).toBe(d.id);
    expect(updated.name).toBe('New Post');
    expect(updated.requiredHeadcount).toBe(10);
    expect(updated.createdAt.toISOString()).toBe(d.createdAt.toISOString());
  });

  it('updateDetachment: immutable fields (id, createdAt) in patch are silently ignored', async () => {
    const c = await clients.createClient({ name: 'Immutable Detachment Client' });
    const d = await clients.createDetachment({ clientId: c.id, name: 'Alpha Post' });
    const fakeId = '00000000-0000-4000-8000-000000000098';
    const updated = await clients.updateDetachment(d.id, {
      name: 'Alpha Post Renamed',
      id: fakeId as unknown as string,
    } as Parameters<typeof clients.updateDetachment>[1]);
    expect(updated.id).toBe(d.id);
    expect(updated.name).toBe('Alpha Post Renamed');
  });

  it('updateDetachment: throws when id not found', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000012';
    await expect(clients.updateDetachment(fakeId, { name: 'Ghost' })).rejects.toThrow(/not found/i);
  });

  // ─── 4.2: getDetachmentDeploymentSummary ─────────────────────────────────

  it('getDetachmentDeploymentSummary: required=10, deployed=8, gap=-2', async () => {
    const c = await clients.createClient({ name: 'Deploy Corp' });
    const d = await clients.createDetachment({ clientId: c.id, name: 'Gate 1', requiredHeadcount: 10 });

    // Seed 8 active assignments
    for (let i = 1; i <= 8; i++) {
      const emp = await hr.createEmployee({
        employeeCode: `CG-D${String(i).padStart(3, '0')}`,
        firstName: `Guard`,
        lastName: `${i}`,
        basicSalary: 15000,
        hiredOn: '2025-01-01',
      });
      await assignments.assign({ employeeId: emp.id, detachmentId: d.id, startDate: '2025-01-01' });
    }

    const summary = await clients.getDetachmentDeploymentSummary(d.id);
    expect(summary.required).toBe(10);
    expect(summary.deployed).toBe(8);
    expect(summary.gap).toBe(-2);
  });

  it('getDetachmentDeploymentSummary: required=null, gap=null', async () => {
    const c = await clients.createClient({ name: 'No Headcount Corp' });
    // No requiredHeadcount set (defaults to null)
    const d = await clients.createDetachment({ clientId: c.id, name: 'Unset Post' });
    const summary = await clients.getDetachmentDeploymentSummary(d.id);
    expect(summary.required).toBeNull();
    expect(summary.deployed).toBe(0);
    expect(summary.gap).toBeNull();
  });

  it('getDetachmentDeploymentSummary: over-deployed — gap is positive', async () => {
    const c = await clients.createClient({ name: 'Overflow Corp' });
    const d = await clients.createDetachment({ clientId: c.id, name: 'Overflow Post', requiredHeadcount: 2 });

    // Seed 4 active assignments
    for (let i = 1; i <= 4; i++) {
      const emp = await hr.createEmployee({
        employeeCode: `CG-O${String(i).padStart(3, '0')}`,
        firstName: `Over`,
        lastName: `Guard${i}`,
        basicSalary: 15000,
        hiredOn: '2025-01-01',
      });
      await assignments.assign({ employeeId: emp.id, detachmentId: d.id, startDate: '2025-01-01' });
    }

    const summary = await clients.getDetachmentDeploymentSummary(d.id);
    expect(summary.required).toBe(2);
    expect(summary.deployed).toBe(4);
    expect(summary.gap).toBe(2); // positive = over-deployed
  });

  // ─── 4.3: listDetachmentsWithDeployment ──────────────────────────────────

  it('listDetachmentsWithDeployment: returns correct deployed counts for multiple detachments', async () => {
    const c = await clients.createClient({ name: 'Multi-Post Corp' });
    const d1 = await clients.createDetachment({ clientId: c.id, name: 'Gate 1', requiredHeadcount: 3 });
    const d2 = await clients.createDetachment({ clientId: c.id, name: 'Gate 2', requiredHeadcount: 2 });
    const d3 = await clients.createDetachment({ clientId: c.id, name: 'Gate 3' }); // no headcount

    // 2 guards → d1, 3 guards → d2, 0 → d3
    for (let i = 1; i <= 2; i++) {
      const emp = await hr.createEmployee({
        employeeCode: `CG-L1${i}`,
        firstName: 'G1',
        lastName: `Guard${i}`,
        basicSalary: 15000,
        hiredOn: '2025-01-01',
      });
      await assignments.assign({ employeeId: emp.id, detachmentId: d1.id, startDate: '2025-01-01' });
    }
    for (let i = 1; i <= 3; i++) {
      const emp = await hr.createEmployee({
        employeeCode: `CG-L2${i}`,
        firstName: 'G2',
        lastName: `Guard${i}`,
        basicSalary: 15000,
        hiredOn: '2025-01-01',
      });
      await assignments.assign({ employeeId: emp.id, detachmentId: d2.id, startDate: '2025-01-01' });
    }

    const list = await clients.listDetachmentsWithDeployment(c.id);
    expect(list).toHaveLength(3);

    const byName = Object.fromEntries(list.map((r) => [r.name, r]));
    expect(byName['Gate 1']!.deployed).toBe(2);
    expect(byName['Gate 1']!.gap).toBe(-1); // 2 - 3
    expect(byName['Gate 2']!.deployed).toBe(3);
    expect(byName['Gate 2']!.gap).toBe(1);  // 3 - 2
    expect(byName['Gate 3']!.deployed).toBe(0);
    expect(byName['Gate 3']!.gap).toBeNull();
  });

  // ─── 4.4: default_payroll_calendar_id round-trip ─────────────────────────

  it('updateClient accepts and persists defaultPayrollCalendarId, getClient returns it', async () => {
    const c = await clients.createClient({ name: 'Payroll Client' });
    expect(c.defaultPayrollCalendarId).toBeNull();

    // Create a real payroll calendar (global default — clientId null) so the FK is satisfied
    const cal = await createPayrollCalendar({ name: 'Semi-Monthly Default', frequency: 'SEMI_MONTHLY' });

    const updated = await clients.updateClient(c.id, { defaultPayrollCalendarId: cal.id });
    expect(updated.defaultPayrollCalendarId).toBe(cal.id);

    // Round-trip: fetch fresh from DB
    const fetched = await clients.getClient(c.id);
    expect(fetched!.defaultPayrollCalendarId).toBe(cal.id);
  });

  // ─── Slice 2: deleteClient (5-minute window) ──────────────────────────────

  it('deleteClient: deletes a client created less than 5 minutes ago (no detachments)', async () => {
    const c = await clients.createClient({ name: 'Quick Mistake Corp' });
    await clients.deleteClient(c.id);
    const fetched = await clients.getClient(c.id);
    expect(fetched).toBeNull();
  });

  it('deleteClient: deletes a client with empty detachments (cascade within window)', async () => {
    const c = await clients.createClient({ name: 'With Empty Posts Corp' });
    const d1 = await clients.createDetachment({ clientId: c.id, name: 'Post 1' });
    const d2 = await clients.createDetachment({ clientId: c.id, name: 'Post 2' });
    await clients.deleteClient(c.id);
    expect(await clients.getClient(c.id)).toBeNull();
    expect(await clients.getDetachment(d1.id)).toBeNull();
    expect(await clients.getDetachment(d2.id)).toBeNull();
  });

  it('deleteClient: rejects when createdAt is older than 5 minutes', async () => {
    const c = await clients.createClient({ name: 'Too Old Corp' });
    // Backdate so the 5-minute window has elapsed
    await getDb().execute(sql`
      UPDATE clients SET created_at = NOW() - INTERVAL '6 minutes' WHERE id = ${c.id}
    `);
    await expect(clients.deleteClient(c.id)).rejects.toThrow(/5-minute delete window has passed/);
    // Client still exists
    expect(await clients.getClient(c.id)).not.toBeNull();
  });

  it('deleteClient: rejects when client not found', async () => {
    await expect(
      clients.deleteClient('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/not found/);
  });

  it('deleteClient: rejects when a detachment has any assignment (transaction safety)', async () => {
    const c = await clients.createClient({ name: 'Has Assignment Corp' });
    const d = await clients.createDetachment({ clientId: c.id, name: 'Live Post' });
    const e = await hr.createEmployee({
      employeeCode: 'CG-DC-001', firstName: 'Live', lastName: 'Guard',
      basicSalary: 15000, hiredOn: '2025-01-01',
    });
    await assignments.assign({ employeeId: e.id, detachmentId: d.id, startDate: '2025-01-01' });

    await expect(clients.deleteClient(c.id)).rejects.toThrow(/already has employees assigned/);

    // Transaction safety: both client and detachment still exist
    expect(await clients.getClient(c.id)).not.toBeNull();
    expect(await clients.getDetachment(d.id)).not.toBeNull();
  });

  it("deleteClient: writes a `clients.client.deleted` audit row", async () => {
    const c = await clients.createClient({ name: 'Audit Me Corp' });
    const d = await clients.createDetachment({ clientId: c.id, name: 'Aux Post' });
    await clients.deleteClient(c.id);

    const rows = await getDb()
      .select()
      .from(auditLog)
      .where(sql`action = 'clients.client.deleted' AND target_id = ${c.id}`);
    expect(rows.length).toBe(1);
    const payload = rows[0]!.payload as {
      before: { name: string; id: string };
      deletedDetachmentIds: string[];
    };
    expect(payload.before.name).toBe('Audit Me Corp');
    expect(payload.before.id).toBe(c.id);
    expect(payload.deletedDetachmentIds).toContain(d.id);
  });
});
