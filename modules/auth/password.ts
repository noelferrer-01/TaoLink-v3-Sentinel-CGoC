import { hash, verify } from '@node-rs/argon2';

// argon2id is @node-rs/argon2's default algorithm in v2.x.
// Numeric `Algorithm.Argon2id = 2`, but we can't reference the const enum under
// isolatedModules — and the default is argon2id, so we just omit `algorithm`.
const ARGON_OPTS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}
