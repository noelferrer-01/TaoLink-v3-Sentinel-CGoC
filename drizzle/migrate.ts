/**
 * Minimal SQL migration runner.
 *
 * Why hand-rolled instead of drizzle-kit's migrator: we hand-write `.sql` files
 * (not generated) so we can include triggers and other DDL drizzle-kit doesn't
 * produce. Drizzle schemas in modules/*\/schema.ts must stay in sync with the
 * SQL — that's a discipline rule, not enforced by the tool.
 *
 * Usage:
 *   pnpm db:migrate
 *
 * Tracks applied migrations in `_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)`.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { getEnv } from '../core/env';
import { seedSuperAdmin } from '../modules/auth/bootstrap';
import { closeDb } from '../core/db';

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

async function main() {
  const { DATABASE_URL } = getEnv();
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.warn('[migrate] no .sql files found in', MIGRATIONS_DIR);
    }

    const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations`;
    const appliedSet = new Set(applied.map((r) => r.name));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] skip (already applied): ${file}`);
        continue;
      }
      console.log(`[migrate] apply: ${file}`);
      const body = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
    }

    console.log('[migrate] schema up-to-date');
  } finally {
    await sql.end({ timeout: 5 });
  }

  // Seed super-admin if env vars present. Idempotent.
  const seed = await seedSuperAdmin();
  if (seed.created) {
    console.log(`[migrate] seeded super-admin: ${seed.email}`);
  } else if (seed.email) {
    console.log(`[migrate] super-admin already exists: ${seed.email}`);
  } else {
    console.log('[migrate] no super-admin seed (SEED_ADMIN_EMAIL/PASSWORD not set)');
  }

  await closeDb();
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
