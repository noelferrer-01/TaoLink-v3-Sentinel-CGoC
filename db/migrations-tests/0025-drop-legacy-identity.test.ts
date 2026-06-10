/**
 * 0025-drop-legacy-identity.test.ts — abort-before-damage proof for the
 * physical legacy-column drop (Slice 3a Task 12b).
 *
 * Same scratch-schema technique as the 0024 test: the migrated test DB is
 * already post-0025, so each test rebuilds a SCRATCH SCHEMA with the
 * post-0024 / pre-0025 shape (legacy_* columns present, person_id NOT NULL),
 * seeds rows, and runs the ACTUAL migration file the way the runner does
 * (one transaction; `SET search_path TO <scratch>, public`).
 *
 * Centerpiece assertion: with one employee whose Person carries an unusable
 * (empty) name, the migration THROWS and the legacy_* columns STILL EXIST —
 * because after the drop commits, a pg_dump is the only copy of that data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { getActiveDatabaseUrl } from '@/core/env';

const SCRATCH = 'migration_0025_test';
const MIGRATION_FILE = path.resolve(
  process.cwd(),
  'drizzle/migrations/0025_drop_legacy_identity.sql',
);

let sql: postgres.Sql;
let migrationSql: string;

beforeAll(async () => {
  // Single sticky connection so SET search_path persists across sql.begin().
  sql = postgres(getActiveDatabaseUrl(), { max: 1, prepare: false });
  migrationSql = await readFile(MIGRATION_FILE, 'utf8');
});

afterAll(async () => {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE`);
  await sql.end({ timeout: 5 });
});

/** Rebuilds the scratch schema in the post-0024 (pre-0025) shape. */
async function buildPre0025Scratch(): Promise<void> {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE`);
  await sql.unsafe(`CREATE SCHEMA ${SCRATCH}`);
  await sql.unsafe(`SET search_path TO ${SCRATCH}, public`);
  await sql.unsafe(`
    CREATE TABLE persons (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name    text NOT NULL,
      last_name     text NOT NULL,
      date_of_birth date
    );

    CREATE TABLE hr_employees (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_code             text NOT NULL,
      legacy_first_name         text,
      legacy_last_name          text,
      legacy_middle_name        text,
      legacy_email              text,
      legacy_phone              text,
      legacy_date_of_birth      date,
      legacy_sss_number         text,
      legacy_philhealth_number  text,
      legacy_pagibig_number     text,
      legacy_tin_number         text,
      legacy_address_line1      text,
      legacy_address_line2      text,
      legacy_city               text,
      legacy_province           text,
      legacy_postal_code        varchar(4),
      rdo_code                  varchar(3),
      person_id                 uuid NOT NULL
        CONSTRAINT hr_employees_person_id_fkey
        REFERENCES persons(id) ON DELETE RESTRICT
    );

    CREATE TABLE recruitment_applicants (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      legacy_first_name    text,
      legacy_middle_name   text,
      legacy_last_name     text,
      legacy_date_of_birth date,
      legacy_sss_number    text,
      legacy_phone         text,
      legacy_email         text,
      legacy_address_line1 text,
      legacy_address_line2 text,
      legacy_city          text,
      legacy_province      text,
      person_id            uuid NOT NULL
        CONSTRAINT recruitment_applicants_person_id_fkey
        REFERENCES persons(id) ON DELETE RESTRICT
    );
  `);
}

/** Runs the real 0025 file exactly like drizzle/migrate.ts does: one transaction. */
async function applyMigrationLikeRunner(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(migrationSql);
  });
}

async function columnsOf(table: string): Promise<string[]> {
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = ${SCRATCH} AND table_name = ${table}
  `;
  return rows.map((r) => r.column_name);
}

describe('migration 0025 — gate aborts before damage', () => {
  it('THROWS when an employee Person has an unusable name and keeps the legacy columns', async () => {
    await buildPre0025Scratch();

    const [ok] = await sql<{ id: string }[]>`
      INSERT INTO persons (first_name, last_name) VALUES ('Usable', 'Person') RETURNING id
    `;
    // The bad case the gate must catch: identity never actually reached the
    // Person (empty name) — the legacy copy is still the only copy.
    const [bad] = await sql<{ id: string }[]>`
      INSERT INTO persons (first_name, last_name) VALUES ('', 'Person') RETURNING id
    `;
    await sql`
      INSERT INTO hr_employees (employee_code, legacy_first_name, legacy_sss_number, person_id)
      VALUES ('CG-OK-001', 'Usable', '34-0000001-1', ${ok!.id})
    `;
    await sql`
      INSERT INTO hr_employees (employee_code, legacy_first_name, legacy_sss_number, person_id)
      VALUES ('CG-BAD-001', 'OnlyCopy', '34-0000002-2', ${bad!.id})
    `;

    await expect(applyMigrationLikeRunner()).rejects.toThrow(/Person identity incomplete/);

    // The legacy columns STILL EXIST and the data is still readable.
    const empCols = await columnsOf('hr_employees');
    expect(empCols).toContain('legacy_first_name');
    expect(empCols).toContain('legacy_sss_number');
    const rows = await sql<{ legacy_first_name: string }[]>`
      SELECT legacy_first_name FROM hr_employees ORDER BY employee_code
    `;
    expect(rows.map((r) => r.legacy_first_name)).toEqual(['OnlyCopy', 'Usable']);
  });

  it('also aborts when the unusable Person belongs to an applicant', async () => {
    await buildPre0025Scratch();

    const [bad] = await sql<{ id: string }[]>`
      INSERT INTO persons (first_name, last_name) VALUES ('App', '') RETURNING id
    `;
    await sql`
      INSERT INTO recruitment_applicants (legacy_first_name, person_id)
      VALUES ('OnlyCopy', ${bad!.id})
    `;

    await expect(applyMigrationLikeRunner()).rejects.toThrow(/Person identity incomplete/);
    expect(await columnsOf('recruitment_applicants')).toContain('legacy_first_name');
  });

  it('green path: drops all legacy_* columns on a healthy DB and keeps role fields', async () => {
    await buildPre0025Scratch();

    const [p] = await sql<{ id: string }[]>`
      INSERT INTO persons (first_name, last_name) VALUES ('Clean', 'Person') RETURNING id
    `;
    await sql`
      INSERT INTO hr_employees (employee_code, legacy_first_name, rdo_code, person_id)
      VALUES ('CG-OK-001', 'Clean', '049', ${p!.id})
    `;
    await sql`
      INSERT INTO recruitment_applicants (legacy_first_name, person_id)
      VALUES ('Clean', ${p!.id})
    `;

    await applyMigrationLikeRunner();

    const empCols = await columnsOf('hr_employees');
    expect(empCols.filter((c) => c.startsWith('legacy_'))).toEqual([]);
    expect(empCols).toContain('rdo_code');
    expect(empCols).toContain('person_id');

    const appCols = await columnsOf('recruitment_applicants');
    expect(appCols.filter((c) => c.startsWith('legacy_'))).toEqual([]);

    // Rows survive; identity reads from persons.
    const [row] = await sql<{ employee_code: string; first_name: string }[]>`
      SELECT e.employee_code, p.first_name
      FROM hr_employees e JOIN persons p ON p.id = e.person_id
    `;
    expect(row).toEqual({ employee_code: 'CG-OK-001', first_name: 'Clean' });
  });
});
