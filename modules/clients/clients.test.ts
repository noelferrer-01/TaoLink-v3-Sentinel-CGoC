import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { closeDb, getDb } from '@/core/db';
import { clients as clientsTable, detachments as detachmentsTable } from './schema';
import { assignments as assignmentsTable } from '@/modules/assignments/schema';
import { clients } from './index';

describe('clients module', () => {
  beforeEach(async () => {
    // FK order: assignments → detachments → clients
    await getDb().delete(assignmentsTable);
    await getDb().delete(detachmentsTable);
    await getDb().delete(clientsTable);
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
});
