import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { users } from './schema';
import { hashPassword } from './password';
import { getEnv } from '@/core/env';

export async function seedSuperAdmin(): Promise<{ created: boolean; email?: string }> {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = getEnv();
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    return { created: false };
  }
  const email = SEED_ADMIN_EMAIL.toLowerCase();
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return { created: false, email };
  }
  const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);
  await db.insert(users).values({ email, passwordHash, role: 'super_admin' });
  return { created: true, email };
}
