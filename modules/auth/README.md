# modules/auth

## Purpose

Hand-rolled session authentication for Sentinel. argon2id password hashing, DB-backed opaque session tokens, HttpOnly cookies. No external auth providers (per [ADR 0005](../../wiki/decisions/0005-stack.md)).

## Public API

Import from `@/modules/auth`. Anything outside `index.ts` is private — do not reach in.

- `auth.login(email, password) → { ok, session } | { ok: false, reason }`
- `auth.logout(token) → void`
- `auth.findSessionByToken(token) → SessionRecord | null`
- `auth.getSessionFromCookie() → SessionRecord | null` _(reads `next/headers` cookies)_
- `auth.requireUser() → SessionRecord` _(throws if unauthenticated)_
- `auth.createUser({ email, password, role? }) → User`
- `auth.SESSION_COOKIE_NAME` — `'sentinel_session'`

## Dependencies

- **Env:** `DATABASE_URL`, `SESSION_SECRET` (≥32 chars). Optional bootstrap: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.
- **Modules:** `@/modules/audit` (every auth event writes an audit row).
- **Tables:** `users`, `sessions`.

## Known failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `SESSION_SECRET must be at least 32 characters` at boot | `.env` missing or short `SESSION_SECRET` | `openssl rand -hex 32` and paste into `.env`. |
| Login always returns `invalid_credentials` after fresh setup | Super-admin not seeded | Set `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` in `.env`, re-run `pnpm db:migrate`. |
| `requireUser` throws on every request | Cookie not set / wrong cookie name | Confirm `Set-Cookie: sentinel_session=...` in login response; check `SameSite` / `Secure` flags vs your origin. |
| `verify` throws on legacy hashes | Hash from an older argon variant | Delete the user; re-create. We pin argon2id; no auto-migration. |
