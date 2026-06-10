/**
 * Slice 2 schema gate (Phase 1 migrations).
 *
 * Verifies that every Phase 1 schema change landed cleanly in the live DB.
 * Pure DB-state checks only — no seeding, no module imports beyond db infra.
 * If a later phase accidentally drops a column or extension, this gate fires.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { closeDb, getSql } from '@/core/db';

describe('Slice 2 schema gate', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('pg_trgm extension is enabled', async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `;
    expect(rows.length).toBe(1);
  });

  // Updated at Slice 3a T12 (migration 0024): identity-shaped BIR fields
  // (date_of_birth, address_line1, postal_code) moved to `persons`; the
  // employee role row keeps employment_type + rdo_code. The legacy columns
  // were RENAMED to legacy_* (recovery window), not dropped — Task 12b drops
  // them later, at which point the legacy_* assertions below get removed too.
  it('hr_employees keeps role fields; identity BIR fields live on persons', async () => {
    const sql = getSql();
    const roleCols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'hr_employees'
        AND column_name IN ('employment_type', 'rdo_code')
    `;
    expect(roleCols.length).toBe(2);

    const personCols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'persons'
        AND column_name IN ('date_of_birth', 'address_line1', 'postal_code')
    `;
    expect(personCols.length).toBe(3);

    // 0024 renamed (did not drop) the legacy identity columns.
    const legacyCols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'hr_employees'
        AND column_name IN ('legacy_date_of_birth', 'legacy_address_line1', 'legacy_postal_code')
    `;
    expect(legacyCols.length).toBe(3);
  });

  it('detachments has required_headcount', async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'detachments'
        AND column_name = 'required_headcount'
    `;
    expect(rows.length).toBe(1);
  });

  it('payroll_calendars table exists', async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT to_regclass('payroll_calendars') AS regclass
    `;
    expect(rows[0]?.regclass).not.toBeNull();
    expect(rows[0]?.regclass).toBe('payroll_calendars');
  });

  it('pay_runs has dtr_cutoff_date + payday_date', async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'pay_runs'
        AND column_name IN ('dtr_cutoff_date', 'payday_date')
    `;
    expect(rows.length).toBe(2);
  });
});
