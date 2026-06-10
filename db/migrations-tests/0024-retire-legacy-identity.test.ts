/**
 * 0024-retire-legacy-identity.test.ts — abort-before-damage proof for the
 * column-retirement migration (Slice 3a Task 12).
 *
 * The migrated test DB (public schema) is already post-0024, so a pre-0024
 * state can't be staged there. Instead, each test rebuilds a SCRATCH SCHEMA
 * inside the same test database containing real pre-0024-shaped tables (the
 * exact tables/columns/indexes/constraints that 0024 touches), seeds real
 * rows, and runs the ACTUAL migration file through the same mechanism the
 * runner uses (drizzle/migrate.ts wraps each file in one `sql.begin`
 * transaction; `SET search_path TO <scratch>, public` makes the migration's
 * unqualified names resolve to the scratch copies — `public` stays on the
 * path only so pg_trgm's gin_trgm_ops opclass resolves).
 *
 * Centerpiece assertion: with one NULL person_id row present, the migration
 * THROWS ('Backfill incomplete') and the identity columns STILL EXIST
 * afterwards — the gate aborts the transaction before any rename runs.
 *
 * The green-path test proves the other half: on a fully-backfilled DB the
 * data survives under legacy_* names, person_id becomes NOT NULL, the FK
 * becomes RESTRICT, legacy indexes are gone, and the new FK indexes exist.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { getActiveDatabaseUrl } from '@/core/env';

const SCRATCH = 'migration_0024_test';
const MIGRATION_FILE = path.resolve(
  process.cwd(),
  'drizzle/migrations/0024_retire_legacy_identity.sql',
);

let sql: postgres.Sql;
let migrationSql: string;

beforeAll(async () => {
  // Dedicated single connection (max: 1) so SET search_path is sticky for the
  // whole test file, including inside sql.begin().
  sql = postgres(getActiveDatabaseUrl(), { max: 1, prepare: false });
  migrationSql = await readFile(MIGRATION_FILE, 'utf8');
});

afterAll(async () => {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE`);
  await sql.end({ timeout: 5 });
});

/** Rebuilds the scratch schema with the pre-0024 shape of every table 0024 touches. */
async function buildPre0024Scratch(): Promise<void> {
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
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_code      text NOT NULL,
      first_name         text NOT NULL,
      last_name          text NOT NULL,
      middle_name        text,
      email              text,
      phone              text,
      date_of_birth      date,
      sss_number         text,
      philhealth_number  text,
      pagibig_number     text,
      tin_number         text,
      address_line1      text,
      address_line2      text,
      city               text,
      province           text,
      postal_code        varchar(4),
      rdo_code           varchar(3),
      person_id          uuid CONSTRAINT hr_employees_person_id_fkey
                           REFERENCES persons(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX hr_employees_email_uq ON hr_employees (email);
    CREATE INDEX hr_employees_fullname_trgm
      ON hr_employees USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

    CREATE TABLE recruitment_applicants (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name    text NOT NULL,
      middle_name   text,
      last_name     text NOT NULL,
      date_of_birth date,
      sss_number    text,
      phone         text,
      email         text,
      address_line1 text,
      address_line2 text,
      city          text,
      province      text,
      person_id     uuid CONSTRAINT recruitment_applicants_person_id_fkey
                      REFERENCES persons(id) ON DELETE SET NULL
    );
    CREATE INDEX recruitment_applicants_lastname_idx ON recruitment_applicants (last_name);

    CREATE TABLE recruitment_blacklist (
      id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      person_id uuid REFERENCES persons(id) ON DELETE SET NULL
    );
  `);
}

/** Runs the real 0024 file exactly like drizzle/migrate.ts does: one transaction. */
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

async function scratchIndexNames(): Promise<string[]> {
  const rows = await sql<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = ${SCRATCH}
  `;
  return rows.map((r) => r.indexname);
}

describe('migration 0024 — gate aborts before damage', () => {
  it('THROWS on a NULL person_id row and leaves the identity columns untouched', async () => {
    await buildPre0024Scratch();

    const [p] = await sql<{ id: string }[]>`
      INSERT INTO persons (first_name, last_name) VALUES ('Linked', 'Person') RETURNING id
    `;
    await sql`
      INSERT INTO hr_employees (employee_code, first_name, last_name, sss_number, person_id)
      VALUES ('CG-OK-001', 'Has', 'Person', '34-0000001-1', ${p!.id})
    `;
    // The one stray un-backfilled row the gate must catch:
    await sql`
      INSERT INTO hr_employees (employee_code, first_name, last_name, person_id)
      VALUES ('CG-STRAY-1', 'No', 'Person', NULL)
    `;
    await sql`
      INSERT INTO recruitment_applicants (first_name, last_name, person_id)
      VALUES ('App', 'Linked', ${p!.id})
    `;

    // The real migration file, run the way the runner runs it, must abort.
    await expect(applyMigrationLikeRunner()).rejects.toThrow(/Backfill incomplete/);

    // Identity columns STILL EXIST — the gate fired before any rename.
    const empCols = await columnsOf('hr_employees');
    expect(empCols).toContain('first_name');
    expect(empCols).toContain('sss_number');
    expect(empCols).not.toContain('legacy_first_name');
    expect(empCols).not.toContain('legacy_sss_number');

    const appCols = await columnsOf('recruitment_applicants');
    expect(appCols).toContain('first_name');
    expect(appCols).not.toContain('legacy_first_name');

    // person_id is still nullable — the SET NOT NULL second gate rolled back too.
    const [pidCol] = await sql<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = ${SCRATCH} AND table_name = 'hr_employees' AND column_name = 'person_id'
    `;
    expect(pidCol!.is_nullable).toBe('YES');

    // Data is intact and readable under the ORIGINAL column names.
    const rows = await sql<{ first_name: string }[]>`
      SELECT first_name FROM hr_employees ORDER BY employee_code
    `;
    expect(rows.map((r) => r.first_name)).toEqual(['Has', 'No']);
  });

  it('also aborts when the NULL person_id row is an applicant', async () => {
    await buildPre0024Scratch();

    const [p] = await sql<{ id: string }[]>`
      INSERT INTO persons (first_name, last_name) VALUES ('Linked', 'Person') RETURNING id
    `;
    await sql`
      INSERT INTO hr_employees (employee_code, first_name, last_name, person_id)
      VALUES ('CG-OK-001', 'Has', 'Person', ${p!.id})
    `;
    await sql`
      INSERT INTO recruitment_applicants (first_name, last_name, person_id)
      VALUES ('Stray', 'Applicant', NULL)
    `;

    await expect(applyMigrationLikeRunner()).rejects.toThrow(/Backfill incomplete/);

    const appCols = await columnsOf('recruitment_applicants');
    expect(appCols).toContain('first_name');
    expect(appCols).not.toContain('legacy_first_name');
  });
});

describe('migration 0024 — green path on a fully-backfilled DB', () => {
  it('renames to legacy_* with data retained, enforces NOT NULL + RESTRICT, swaps indexes', async () => {
    await buildPre0024Scratch();

    const [p] = await sql<{ id: string }[]>`
      INSERT INTO persons (first_name, last_name, date_of_birth)
      VALUES ('Juan', 'Dela Cruz', '1990-01-01') RETURNING id
    `;
    await sql`
      INSERT INTO hr_employees (employee_code, first_name, last_name, sss_number, person_id)
      VALUES ('CG-GP-001', 'Juan', 'Dela Cruz', '34-1234567-8', ${p!.id})
    `;
    await sql`
      INSERT INTO recruitment_applicants (first_name, last_name, sss_number, person_id)
      VALUES ('Juan', 'Dela Cruz', '34-1234567-8', ${p!.id})
    `;

    await applyMigrationLikeRunner(); // must NOT throw

    // Renamed, originals gone — both tables.
    const empCols = await columnsOf('hr_employees');
    expect(empCols).toContain('legacy_first_name');
    expect(empCols).toContain('legacy_sss_number');
    expect(empCols).toContain('legacy_postal_code');
    expect(empCols).not.toContain('first_name');
    expect(empCols).not.toContain('sss_number');
    expect(empCols).toContain('rdo_code'); // rdo_code STAYS — role-owned BIR field

    const appCols = await columnsOf('recruitment_applicants');
    expect(appCols).toContain('legacy_first_name');
    expect(appCols).not.toContain('first_name');

    // Data physically retained under the legacy_* names (the recovery window).
    const [e] = await sql<{ legacy_first_name: string; legacy_sss_number: string }[]>`
      SELECT legacy_first_name, legacy_sss_number FROM hr_employees
    `;
    expect(e!.legacy_first_name).toBe('Juan');
    expect(e!.legacy_sss_number).toBe('34-1234567-8');

    // Second gate now permanent: inserts without person_id are rejected,
    // and the renamed legacy columns are NOT required (NOT NULL dropped).
    await expect(
      sql`INSERT INTO hr_employees (employee_code) VALUES ('CG-GP-NEW')`,
    ).rejects.toThrow(/person_id/);
    await sql`
      INSERT INTO hr_employees (employee_code, person_id) VALUES ('CG-GP-NEW', ${p!.id})
    `; // succeeds with NO legacy identity values

    // FK is now RESTRICT: a referenced Person cannot be deleted.
    await expect(sql`DELETE FROM persons WHERE id = ${p!.id}`).rejects.toThrow(
      /foreign key|violates/i,
    );

    // Index swap: legacy identity indexes gone, FK/matcher indexes present.
    const idx = await scratchIndexNames();
    expect(idx).not.toContain('hr_employees_email_uq');
    expect(idx).not.toContain('hr_employees_fullname_trgm');
    expect(idx).not.toContain('recruitment_applicants_lastname_idx');
    expect(idx).toContain('hr_employees_person_id_idx');
    expect(idx).toContain('recruitment_applicants_person_id_idx');
    expect(idx).toContain('recruitment_blacklist_person_id_idx');
    expect(idx).toContain('persons_dob_idx');
  });
});
