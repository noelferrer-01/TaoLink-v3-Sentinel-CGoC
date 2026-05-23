import { randomBytes, createHmac } from 'node:crypto';
import { getEnv } from '@/core/env';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  const { SESSION_SECRET } = getEnv();
  return createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}

export const SESSION_TTL_DAYS = 14;

export function sessionExpiry(now: Date = new Date()): Date {
  const out = new Date(now);
  out.setUTCDate(out.getUTCDate() + SESSION_TTL_DAYS);
  return out;
}
