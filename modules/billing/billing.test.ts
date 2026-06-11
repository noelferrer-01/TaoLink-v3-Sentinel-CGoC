/**
 * billing.test.ts — integration tests for the billing module (Slice 4, Task 3).
 *
 * Coverage:
 *   setClientBillingConfig — insert, upsert (same client → still one row), audit
 *   getClientBillingConfig — returns null when unset, row when set
 *
 * Fixture: a Client row is required; we create it via `clients.createClient` and
 * clean up in beforeEach using FK-ordered deletes (billing config cascades from
 * client, so deleting clients also drops config rows).
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { closeDb, getDb } from '@/core/db';
import { clients as clientsTable } from '@/modules/clients/schema';
import { clientBillingConfig } from './schema';
import { auditLog } from '@/modules/audit/schema';
import { clients } from '@/modules/clients/index';
import { setClientBillingConfig, getClientBillingConfig } from './service';
import { eq, sql } from 'drizzle-orm';

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  const db = getDb();
  // FK order: client_billing_config → clients (CASCADE, but explicit for clarity)
  await db.delete(clientBillingConfig);
  await db.delete(clientsTable);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('billing.setClientBillingConfig', () => {
  beforeEach(cleanup);
  afterAll(async () => { await closeDb(); });

  it('inserts a billing config for a new client', async () => {
    const client = await clients.createClient({ name: 'Commander Group' });

    const config = await setClientBillingConfig({
      clientId: client.id,
      ratePerManday: '650.00',
    });

    expect(config.clientId).toBe(client.id);
    expect(config.ratePerManday).toBe('650.00');
    expect(config.paymentTermsDays).toBe(15);
    expect(config.chargesVat).toBe(true);
    expect(config.clientWithholdsEwt).toBe(true);
    expect(config.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('upserts — updating the same client changes the rate, still only one row', async () => {
    const client = await clients.createClient({ name: 'Client Upsert Test' });

    await setClientBillingConfig({ clientId: client.id, ratePerManday: '500.00' });
    const updated = await setClientBillingConfig({ clientId: client.id, ratePerManday: '750.00', paymentTermsDays: 30 });

    expect(updated.ratePerManday).toBe('750.00');
    expect(updated.paymentTermsDays).toBe(30);

    // Confirm exactly one row for this client in the DB.
    const rows = await getDb()
      .select()
      .from(clientBillingConfig)
      .where(eq(clientBillingConfig.clientId, client.id));
    expect(rows.length).toBe(1);
  });

  it('audits billing.config.updated with clientId only (no PII)', async () => {
    const client = await clients.createClient({ name: 'PII Test Client' });

    // actorUserId must be a UUID or null (FK to users.id); pass null in tests.
    await setClientBillingConfig({
      clientId: client.id,
      ratePerManday: '600.00',
      actorUserId: null,
    });

    const rows = await getDb().select().from(auditLog)
      .where(sql`action = 'billing.config.updated' AND target_id = ${client.id}`);

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const blob = JSON.stringify(rows[0]!.payload);
    // clientId is the only expected payload field
    expect(blob).toContain(client.id);
    // client name must NOT leak into the audit payload
    expect(blob).not.toContain('PII Test Client');
  });
});

describe('billing.getClientBillingConfig', () => {
  beforeEach(cleanup);
  afterAll(async () => { await closeDb(); });

  it('returns null when no config is set for the client', async () => {
    const client = await clients.createClient({ name: 'No Config Client' });
    const result = await getClientBillingConfig(client.id);
    expect(result).toBeNull();
  });

  it('returns the config row when set', async () => {
    const client = await clients.createClient({ name: 'Has Config Client' });
    await setClientBillingConfig({ clientId: client.id, ratePerManday: '400.00', chargesVat: false });

    const result = await getClientBillingConfig(client.id);
    expect(result).not.toBeNull();
    expect(result!.clientId).toBe(client.id);
    expect(result!.ratePerManday).toBe('400.00');
    expect(result!.chargesVat).toBe(false);
  });
});
