import { eq, gt, and } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '@/core/db';
import { audit } from '@/modules/audit';
import { users, sessions, type User } from './schema';
import { hashPassword, verifyPassword } from './password';
import { generateSessionToken, hashToken, sessionExpiry } from './tokens';

export const SESSION_COOKIE_NAME = 'sentinel_session';

export type SessionRecord = {
  token: string;
  expiresAt: Date;
  user: Pick<User, 'id' | 'email' | 'role'>;
};

export type LoginResult =
  | { ok: true; session: SessionRecord }
  | { ok: false; reason: 'invalid_credentials' };

export async function login(email: string, password: string): Promise<LoginResult> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    await audit.record({
      actor: null,
      action: 'auth.login_failed',
      target: { kind: 'user', id: email },
      payload: { reason: 'no_such_user' },
    });
    return { ok: false, reason: 'invalid_credentials' };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await audit.record({
      actor: user.id,
      action: 'auth.login_failed',
      target: { kind: 'user', id: user.id },
      payload: { reason: 'bad_password' },
    });
    return { ok: false, reason: 'invalid_credentials' };
  }

  const token = generateSessionToken();
  const expiresAt = sessionExpiry();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  await audit.record({
    actor: user.id,
    action: 'auth.login',
    target: { kind: 'user', id: user.id },
    payload: {},
  });

  return {
    ok: true,
    session: {
      token,
      expiresAt,
      user: { id: user.id, email: user.email, role: user.role },
    },
  };
}

export async function logout(token: string): Promise<void> {
  const db = getDb();
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));

  if (row) {
    await audit.record({
      actor: row.userId,
      action: 'auth.logout',
      target: { kind: 'user', id: row.userId },
      payload: {},
    });
  }
}

export async function findSessionByToken(token: string): Promise<SessionRecord | null> {
  const db = getDb();
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      token: sessions.tokenHash,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    token,
    expiresAt: row.expiresAt,
    user: { id: row.userId, email: row.email, role: row.role },
  };
}

export async function getSessionFromCookie(): Promise<SessionRecord | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return findSessionByToken(token);
}

export async function requireUser(): Promise<SessionRecord> {
  const session = await getSessionFromCookie();
  if (!session) {
    throw new Error('[auth] unauthenticated');
  }
  return session;
}

export async function createUser(args: {
  email: string;
  password: string;
  role?: string;
}): Promise<User> {
  const db = getDb();
  const passwordHash = await hashPassword(args.password);
  const [row] = await db
    .insert(users)
    .values({
      email: args.email.toLowerCase(),
      passwordHash,
      role: args.role ?? 'user',
    })
    .returning();
  if (!row) throw new Error('[auth] failed to create user');
  await audit.record({
    actor: null,
    action: 'auth.user_created',
    target: { kind: 'user', id: row.id },
    payload: { email: row.email, role: row.role },
  });
  return row;
}
