import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeDb } from '@/core/db';
import { auth } from './index';

// Unique per-run email to avoid collisions; we don't delete the test user
// (sessions cascade away, audit_log SET-NULLs the actor — but leaving the user
// in the test DB is harmless and avoids brittle cleanup ordering).
const EMAIL = `test-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@sentinel.test`;
const PASSWORD = 'a-strong-test-password-9876543210';

describe('auth.login + auth.logout', () => {
  beforeAll(async () => {
    await auth.createUser({ email: EMAIL, password: PASSWORD });
  });

  afterAll(async () => {
    await closeDb();
  });

  it('rejects bad password', async () => {
    const res = await auth.login(EMAIL, 'wrong-password');
    expect(res.ok).toBe(false);
  });

  it('rejects unknown user', async () => {
    const res = await auth.login('no-such-user@sentinel.test', 'whatever');
    expect(res.ok).toBe(false);
  });

  it('logs in with correct credentials and yields a token', async () => {
    const res = await auth.login(EMAIL, PASSWORD);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.session.token.length).toBeGreaterThan(20);
    expect(res.session.user.email).toBe(EMAIL);

    const found = await auth.findSessionByToken(res.session.token);
    expect(found?.user.email).toBe(EMAIL);

    await auth.logout(res.session.token);
    const after = await auth.findSessionByToken(res.session.token);
    expect(after).toBeNull();
  });
});
