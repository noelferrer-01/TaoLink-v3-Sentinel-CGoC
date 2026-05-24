import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { closeDb, getDb } from '@/core/db';
import { payrollCalendars as payrollCalendarsTable } from './schema';
import { clients as clientsTable } from '@/modules/clients/schema';
import * as calendars from './index';
import { createClient } from '@/modules/clients';

describe('payroll-calendars: create + getForClient', () => {
  beforeEach(async () => {
    // FK order: payroll_calendars.client_id → clients.id
    // (clients.default_payroll_calendar_id is never set in these tests, so no NULL-out needed)
    await getDb().delete(payrollCalendarsTable);
    await getDb().delete(clientsTable);
  });
  afterAll(async () => { await closeDb(); });

  it('creates a calendar and retrieves it by client id', async () => {
    const client = await createClient({ name: 'SM Prime' });
    const cal = await calendars.create({
      clientId: client.id,
      name: 'SM Prime Semi-Monthly',
      frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 2,
      paydayDaysAfterPeriodEnd: 5,
    });
    const fetched = await calendars.getForClient(client.id);
    expect(fetched?.id).toBe(cal.id);
    expect(fetched?.name).toBe('SM Prime Semi-Monthly');
  });

  it('returns global default when no per-client calendar exists', async () => {
    await calendars.create({
      clientId: null,
      name: 'Global default',
      frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 3,
      paydayDaysAfterPeriodEnd: 7,
    });
    const client = await createClient({ name: 'Ayala' });
    const fetched = await calendars.getForClient(client.id);
    expect(fetched?.name).toBe('Global default');
  });

  it('returns null when no calendar exists at all', async () => {
    const client = await createClient({ name: 'Z' });
    const fetched = await calendars.getForClient(client.id);
    expect(fetched).toBeNull();
  });
});

describe('payroll-calendars: resolveForPeriod', () => {
  beforeEach(async () => {
    await getDb().delete(payrollCalendarsTable);
    await getDb().delete(clientsTable);
  });

  it('uses client-specific calendar when present', async () => {
    const client = await createClient({ name: 'X' });
    await calendars.create({
      clientId: client.id,
      name: 'X-Cal',
      frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 2,
      paydayDaysAfterPeriodEnd: 5,
    });
    const r = await calendars.resolveForPeriod(
      client.id, new Date('2026-05-16'), new Date('2026-05-31'),
    );
    expect(r.dtrCutoffDate.toISOString().slice(0, 10)).toBe('2026-06-02');
    expect(r.paydayDate.toISOString().slice(0, 10)).toBe('2026-06-05');
    expect(r.source).toBe('client');
  });

  it('falls back to global default when no per-client calendar', async () => {
    await calendars.create({
      clientId: null, name: 'Global', frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 3, paydayDaysAfterPeriodEnd: 7,
    });
    const client = await createClient({ name: 'Y' });
    const r = await calendars.resolveForPeriod(
      client.id, new Date('2026-05-16'), new Date('2026-05-31'),
    );
    expect(r.source).toBe('global-default');
    expect(r.dtrCutoffDate.toISOString().slice(0, 10)).toBe('2026-06-03');
    expect(r.paydayDate.toISOString().slice(0, 10)).toBe('2026-06-07');
  });

  it('uses fallback defaults (2 + 5 days) when no calendar at all', async () => {
    const client = await createClient({ name: 'Z' });
    const r = await calendars.resolveForPeriod(
      client.id, new Date('2026-05-16'), new Date('2026-05-31'),
    );
    expect(r.source).toBe('fallback-defaults');
    expect(r.dtrCutoffDate.toISOString().slice(0, 10)).toBe('2026-06-02');
    expect(r.paydayDate.toISOString().slice(0, 10)).toBe('2026-06-05');
  });
});

describe('payroll-calendars: update', () => {
  beforeEach(async () => {
    await getDb().delete(payrollCalendarsTable);
    await getDb().delete(clientsTable);
  });

  it('updates fields and bumps updated_at', async () => {
    const cal = await calendars.create({
      clientId: null, name: 'old', frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 2, paydayDaysAfterPeriodEnd: 5,
    });
    const before = new Date(cal.updatedAt).getTime();
    await new Promise(r => setTimeout(r, 10));
    const updated = await calendars.update(cal.id, { name: 'new', paydayDaysAfterPeriodEnd: 7 });
    expect(updated.name).toBe('new');
    expect(updated.paydayDaysAfterPeriodEnd).toBe(7);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(before);
  });

  it('throws on missing id', async () => {
    await expect(
      calendars.update('00000000-0000-0000-0000-000000000000', { name: 'x' })
    ).rejects.toThrow(/not found/);
  });
});
