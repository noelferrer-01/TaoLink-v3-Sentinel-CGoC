# Directive — Slice 0 bootstrap

> SOP for standing up a fresh Sentinel dev environment from a clean clone.

## Inputs

- A Mac or Linux dev box with Docker, Node 20+, and pnpm 10+ installed.
- The repo cloned.

## Steps

1. **Copy env template**
   ```bash
   cp .env.example .env
   ```

2. **Fill in `.env`:**
   - `SESSION_SECRET` — `openssl rand -hex 32` (paste output).
   - `SEED_ADMIN_EMAIL` — your dev email.
   - `SEED_ADMIN_PASSWORD` — a real password (you'll log in with this).

3. **Start the stack**
   ```bash
   docker compose up
   ```
   First boot pulls images and runs `pnpm db:migrate`. Subsequent boots reuse the volume.

4. **Verify**
   - Visit `http://localhost:3000` — you should see the Slice 0 placeholder.
   - Click "Log in", use the seeded credentials.
   - After login, the home page shows your email.

5. **Run the tests against the running Postgres** _(host-side)_
   ```bash
   pnpm install
   DATABASE_URL=postgres://sentinel:sentinel@localhost:5432/sentinel \
   SESSION_SECRET=$(grep ^SESSION_SECRET .env | cut -d= -f2) \
   pnpm test
   ```
   All four smoke suites (auth, audit, approvals, events) should pass.

## When it doesn't work

| Symptom | Probable cause | Fix |
|---|---|---|
| `SESSION_SECRET must be at least 32 characters` | Empty or short secret in `.env` | Regenerate with `openssl rand -hex 32`. |
| `Cannot connect to postgres:5432` | Postgres health check still warming up | Wait 10s. If it persists, `docker compose logs postgres`. |
| `[migrate] failed: relation "users" already exists` | Migration ran twice without the `_migrations` table | The `_migrations` table tracks applied files. If you blew it away, drop the public schema and re-run, or just blow away the volume: `docker compose down -v && docker compose up`. |
| Login returns "Invalid email or password" with the seeded credentials | Seed did not run (vars unset at first migrate) | Set `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` in `.env`, re-run `pnpm db:migrate` (or restart compose). Idempotent. |
| `audit_log is append-only (UPDATE blocked on row N)` somewhere in app code | Some code path is trying to update audit rows | Don't. Write a new audit row recording the correction. Originals are sacred. |

## Outputs

- `localhost:3000` serving the Slice 0 placeholder, login working, audit/approvals/events smoke tests green.
- Slice 1 can begin.
