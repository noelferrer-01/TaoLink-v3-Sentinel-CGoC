/**
 * scripts/db-test-setup.ts
 *
 * Creates the test Postgres database (if missing) and applies all migrations
 * to it. Idempotent — safe to run multiple times.
 *
 * Reads TEST_DATABASE_URL from .env. Derives the admin connection string
 * (same host/credentials, `postgres` database) so we can issue
 * `CREATE DATABASE` against the cluster.
 *
 * Usage:
 *   pnpm db:test:setup
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import postgres from 'postgres';
import { getEnv } from '../core/env';

function redactCredentials(url: string): string {
  return url.replace(/(postgres:\/\/[^:]+:)[^@]+(@)/i, '$1***$2');
}

async function main() {
  const env = getEnv();
  const url = env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      '[db:test:setup] TEST_DATABASE_URL is not set in .env. ' +
        'Add: TEST_DATABASE_URL=postgres://sentinel:sentinel@localhost:5432/sentinel_test',
    );
  }

  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!dbName) {
    throw new Error(`[db:test:setup] TEST_DATABASE_URL has no database name: ${redactCredentials(url)}`);
  }

  // Refuse to operate on the dev DB by accident.
  const devUrl = new URL(env.DATABASE_URL);
  const devDbName = devUrl.pathname.replace(/^\//, '');
  if (devDbName === dbName) {
    throw new Error(
      `[db:test:setup] TEST_DATABASE_URL points at "${dbName}" which is also the dev DB. ` +
        'Use a separate database (e.g. sentinel_test) to keep test wipes off your seed data.',
    );
  }

  // Admin connection: same host/creds, `postgres` maintenance DB.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  console.log(`[db:test:setup] target: ${redactCredentials(url)}`);
  console.log(`[db:test:setup] admin connection: ${redactCredentials(adminUrl.toString())}`);

  const admin = postgres(adminUrl.toString(), { max: 1, prepare: false });
  try {
    const exists = await admin<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${dbName}) AS exists
    `;
    if (exists[0]?.exists) {
      console.log(`[db:test:setup] database "${dbName}" already exists`);
    } else {
      console.log(`[db:test:setup] creating database "${dbName}"…`);
      // CREATE DATABASE cannot run inside a transaction.
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`[db:test:setup] created "${dbName}"`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }

  // Now run the standard migrator against the test DB by setting NODE_ENV=test
  // so getActiveDatabaseUrl picks TEST_DATABASE_URL.
  console.log(`[db:test:setup] applying migrations to "${dbName}"…`);
  const result = spawnSync('pnpm', ['db:migrate'], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test' },
  });
  if (result.status !== 0) {
    throw new Error(`[db:test:setup] migration runner exited with status ${result.status}`);
  }

  console.log(`[db:test:setup] done. Test DB ready: ${redactCredentials(url)}`);
}

main().catch((err) => {
  console.error('[db:test:setup] failed:', err);
  process.exit(1);
});
