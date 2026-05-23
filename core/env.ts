import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

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
