import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /**
   * Separate Postgres DB used by `pnpm test`. When set AND NODE_ENV='test',
   * `core/db` connects here instead of DATABASE_URL — keeps the test suite's
   * `beforeEach` DELETEs from wiping the dev DB's seed/walk data.
   *
   * If unset in test mode, core/db falls back to DATABASE_URL with a loud
   * stderr warning so the wipe is at least noticed.
   */
  TEST_DATABASE_URL: z.string().optional(),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters (use: openssl rand -hex 32)'),

  SEED_ADMIN_EMAIL: z.string().email().optional().or(z.literal('')),
  SEED_ADMIN_PASSWORD: z.string().optional().or(z.literal('')),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `[core/env] Environment validation failed. Fix .env (template: .env.example):\n${issues}`,
    );
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvForTests(): void {
  cached = null;
}

/**
 * Returns the Postgres URL the app should connect to right now. In NODE_ENV='test'
 * mode this prefers TEST_DATABASE_URL when set; otherwise it falls back to
 * DATABASE_URL with a one-time stderr warning — keeps existing test runs working
 * but makes the data-wipe risk loud and obvious.
 */
let warnedAboutTestFallback = false;
/**
 * "Are we in a test context?" — checked here rather than relying on NODE_ENV
 * alone because `node --env-file=.env` lets the user's .env (which usually
 * sets NODE_ENV=development for the dev server) override vitest's automatic
 * NODE_ENV=test. Vitest sets `process.env.VITEST='true'` regardless, so we
 * use that as a load-bearing signal.
 *
 * Why this matters: getting the detection wrong here means test `beforeEach`
 * DELETEs land in the dev DB. This has happened. Don't break this.
 */
function isTestContext(env: Env): boolean {
  return env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export function getActiveDatabaseUrl(): string {
  const env = getEnv();
  if (isTestContext(env)) {
    if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
    if (!warnedAboutTestFallback) {
      console.warn(
        '[core/env] Test context detected but TEST_DATABASE_URL is unset — tests will hit ' +
          'DATABASE_URL and `beforeEach` DELETEs will wipe your dev seed/walk data. Set ' +
          'TEST_DATABASE_URL in .env (template: .env.example) and run `pnpm db:test:setup` once.',
      );
      warnedAboutTestFallback = true;
    }
  }
  return env.DATABASE_URL;
}
