# Runbook — Migration 0025: drop the legacy identity columns (T12b)

## When to use

When applying `drizzle/migrations/0025_drop_legacy_identity.sql` to any
environment, and when something goes wrong afterwards. This is the second half
of [0024](0024-retire-legacy-identity.md): 0024 **renamed** the duplicated
identity columns to `legacy_*` (recovery window); 0025 **drops them for good**.
Applied to dev + test on 2026-06-11 (post `slice-3-done`).

**After this commits, the pre-0025 pg_dump is the ONLY copy of the legacy
data.** That is the whole risk profile of this migration.

## Prerequisites

1. **0024 applied and verified** (the `_migrations` ledger enforces order).
2. **The app is verified live on the Person** — full suite green, browser
   walks done, `slice-3-done` tagged. Do not run this while any reader still
   touches `legacy_*` (none do; `git grep legacy_` shows only docs/tests).
3. **Fresh dumps — DO NOT PROCEED WITHOUT THEM:**

   ```bash
   mkdir -p .tmp/backups
   pg_dump "$DATABASE_URL"      > .tmp/backups/pre-0025-dev-$(date +%Y%m%d-%H%M%S).sql
   pg_dump "$TEST_DATABASE_URL" > .tmp/backups/pre-0025-test-$(date +%Y%m%d-%H%M%S).sql
   ls -la .tmp/backups/   # confirm sizes > 0 before continuing
   ```

   (Dev-apply dumps: `pre-0025-dev-20260611-040104.sql`, `pre-0025-test-20260611-040104.sql`.)

## Steps

```bash
pnpm db:migrate                 # dev
NODE_ENV=test pnpm db:migrate   # test DB
```

The migration's SQL gate refuses to run if any employee or applicant fails to
resolve to a Person with a usable (non-empty) name — i.e. if the legacy copy
would still be the only copy of someone's identity. The abort-before-damage
behaviour is proven by `db/migrations-tests/0025-drop-legacy-identity.test.ts`.

## Verification

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM information_schema.columns
  WHERE table_name IN ('hr_employees','recruitment_applicants')
  AND column_name LIKE 'legacy_%';"   # must be 0
```

- Row counts unchanged; `SELECT e.employee_code, p.first_name FROM hr_employees e JOIN persons p ON p.id = e.person_id LIMIT 5` reads names fine.
- Full suite green (the slice2-schema regression now asserts zero `legacy_%` columns).

## Rollback

There is no in-database recovery window anymore — restore from the pre-0025
dump:

```bash
# Restores the WHOLE database to the pre-drop state. Anything written after
# the dump is lost — only do this immediately after a bad apply.
psql "$DATABASE_URL" < .tmp/backups/pre-0025-dev-<timestamp>.sql
```

For a surgical recovery (one person's identity, long after apply), restore the
dump into a scratch database and copy the needed values out of its `legacy_*`
columns by `employee_code` / applicant id.
