# Runbook — Migration 0024: retire legacy identity columns

## When to use

When applying Slice 3a's column-retirement migration
(`drizzle/migrations/0024_retire_legacy_identity.sql`) to any environment with
real data, and when something goes wrong afterwards and you need the legacy
data back. Applied to dev on 2026-06-10.

**What 0024 did:** renamed (did NOT drop) every identity column on
`hr_employees` and `recruitment_applicants` to `legacy_<name>` — name, contact,
DOB, SSS/PhilHealth/Pag-IBIG/TIN, address. `persons` is now the sole identity
source. It also made `person_id` NOT NULL on both tables, tightened those FKs
to `ON DELETE RESTRICT`, dropped the legacy email-uniqueness and name-search
indexes (`hr_employees_email_uq`, `hr_employees_fullname_trgm`,
`recruitment_applicants_lastname_idx`), and added btree indexes on
`hr_employees(person_id)`, `recruitment_applicants(person_id)`,
`recruitment_blacklist(person_id)`, `persons(date_of_birth)`.
`rdo_code` stays on the employee row; `recruitment_blacklist` keeps its
name/DOB/SSS snapshot columns.

## Prerequisites

1. **Backfill complete.** `pnpm db:backfill:persons` has run and
   `SELECT count(*) FROM hr_employees WHERE person_id IS NULL` and the same for
   `recruitment_applicants` are both **0**. The migration's SQL gate refuses to
   run otherwise (`RAISE EXCEPTION 'Backfill incomplete'`) — that abort is
   tested in `db/migrations-tests/0024-retire-legacy-identity.test.ts`.
2. **Fresh dump — DO NOT PROCEED WITHOUT IT.** There is no deploy pipeline yet,
   so this is a hard manual precondition, not automation: take a full `pg_dump`
   immediately before applying and verify it is non-empty.

   ```bash
   mkdir -p .tmp/backups
   pg_dump "$DATABASE_URL" > .tmp/backups/pre-0024-$(date +%Y%m%d-%H%M%S).sql
   ls -la .tmp/backups/   # confirm size > 0 before continuing
   ```

   Artifact path convention: `.tmp/backups/pre-0024-<YYYYMMDD-HHMMSS>.sql`
   (gitignored; the dev-apply dump is `pre-0024-20260610-182959.sql`).

## Steps

```bash
pnpm db:migrate          # applies 0024 (gate → SET NOT NULL → renames → indexes/FKs, one transaction)
```

Deploy order across the whole 3a sequence (the gates enforce it):
`pnpm db:migrate` (0021/0022) → `pnpm db:backfill:persons` → `pnpm db:migrate` (0024).

## Verification

```bash
psql "$DATABASE_URL" -c '\d hr_employees'
```

- `legacy_first_name` … `legacy_postal_code` exist; original column names gone.
- `person_id` is `NOT NULL`, FK shows `ON DELETE RESTRICT`.
- `hr_employees_person_id_idx` present; `hr_employees_email_uq` and
  `hr_employees_fullname_trgm` absent.
- Data retained: `SELECT count(legacy_first_name) FROM hr_employees` equals the
  row count, and spot-check
  `SELECT e.legacy_first_name, p.first_name FROM hr_employees e JOIN persons p ON p.id = e.person_id LIMIT 5`
  — the pairs must match.

## Rollback

Two layers, in order of preference:

1. **Recovery window (no restore needed).** The data was renamed, not dropped.
   If a missed reader returns nulls, the fix is to repoint that reader at
   `persons` (or, worst case, a one-off `UPDATE … FROM` copying a `legacy_*`
   column back into `persons`). Nothing is lost while the `legacy_*` columns
   exist.
2. **Full restore from the pre-0024 dump** (only if the database itself is
   damaged):

   ```bash
   # plain-SQL dump → psql restores it; drop/recreate the DB first
   psql "$ADMIN_URL" -c 'DROP DATABASE sentinel' -c 'CREATE DATABASE sentinel'
   psql "$DATABASE_URL" < .tmp/backups/pre-0024-<timestamp>.sql
   # then remove 0024 from the migrations ledger so it can be re-applied later:
   psql "$DATABASE_URL" -c "DELETE FROM _migrations WHERE name = '0024_retire_legacy_identity.sql'"
   ```

   (If a custom-format dump was taken with `pg_dump -Fc`, use `pg_restore -d`
   instead of `psql <`.)

## Task 12b note — the physical drop is SEPARATE and LATER

The `legacy_*` columns are intentionally still on disk. A future one-line
migration (`00NN_drop_legacy_identity.sql`, same gate prefix) drops them — but
only after the app has been verified live on the Person in the target
environment and slice 3 is tagged. Do not fold the drop into any other change.
When 12b lands, also remove the `legacy_*` assertions from
`modules/_regression/tests/slice2-schema.test.ts`.

## Known failure modes

- **`Backfill incomplete — refusing to retire identity columns.`** The gate
  fired: some `person_id` is NULL. Run `pnpm db:backfill:persons`, review its
  quarantine report, re-run `pnpm db:migrate`. Nothing was changed (single
  transaction, abort-before-damage).
- **`null value in column "person_id" … violates not-null constraint`** on a
  later INSERT: a writer is creating role rows without a Person. All writers
  must go through `hr.createEmployee` / `recruitment.createApplicant`, which
  mint or link a Person.
- **`update or delete on table "persons" violates foreign key constraint`**:
  expected — RESTRICT means a Person referenced by an employee/applicant can't
  be deleted. Use `persons.redactPerson` (tombstone) instead of deleting.
- **Backfill script vs post-0024 schema:** `db/backfills/0021-persons.ts` keeps
  a frozen pre-0024 schema snapshot and can only run on a DB that hasn't
  applied 0024 (its integration tests were removed at T12 because the test DB
  is post-0024). Don't "fix" it to use the live module schemas.
