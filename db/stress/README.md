# db/stress — Identity-spine stress harness

## Purpose

Prove (or break) the **Person identity spine** at production scale *before* building
more on top of it. The dev DB has ~100 people; Commander Group has 10,000+ guards.
This harness seeds a throwaway DB to that scale with deliberately nasty data and
measures the **real** search / matcher / hire-gate code paths — both how fast they
are and *why* (which query plan they get).

It is a one-shot diagnostic, not part of the test suite. Run it at seams where the
identity foundation changed (e.g. after migration 0024) and before stacking new
features (T13 UI) on top.

## Public API

- `pnpm db:stress [N] [--keep] [--seed=K]` — the only entry point.
  - `N` — number of persons to seed (default `12000`; minimum `500`).
  - `--keep` — leave `sentinel_stress` up afterward for manual inspection (`pnpm db:studio` against it, etc.). Default drops it.
  - `--seed=K` — PRNG seed for a different-but-reproducible dataset.
- Exit code is **non-zero** on any correctness failure or any latency blow-up (p95 > 250ms), so it can gate a release.
- `seed.ts` exports `seedStress(db, { persons, seed })` — pure seeder, takes a Drizzle client. Reused by nothing else today; kept separate so it can be unit-exercised.

## What it does

1. **Isolated DB.** Drops + recreates `sentinel_stress` and applies every migration
   in-process against an *explicit* client. Triple-guarded: refuses any target DB
   name that equals the dev or test DB, or that doesn't contain `"stress"`. After
   connecting it re-confirms `current_database()` before writing a single row.
2. **Volume + adversarial seed.** ~70% employees / ~25% applicants / ~5% roleless,
   plus: a **Jan-1 DOB cluster** (the real PH "unknown birthday" phenomenon — worst
   case for the name+DOB matcher), **duplicate-SSS persons parked in `quarantinedIds`**,
   `dela Cruz`/`de la Cruz` **particle variants**, and **planted needles** with known
   values so correctness assertions are exact. Then `ANALYZE`.
3. **Latency** — p50/p95/max of the real exported functions (`listEmployeesPage`,
   `searchEmployees`, `listApplicantsPage`, `checkMatches`, `findPossibleDuplicates`,
   `findPersonByAnyId`).
4. **Query plans** — `EXPLAIN ANALYZE` on mirrored queries to see whether the GIN
   trigram index is used *inside the join* (the open T10 question), whether the
   applicant ILIKE search seq-scans `persons`, and the DOB/quarantine/SSS paths.
5. **Correctness** — 12 assertions on the safety behaviors (matcher channels,
   self-exclusion, hire gate, idPending nudge, and that the Jan-1 cluster does not
   false-flag unrelated people as duplicates).
6. **Report** — console summary + a markdown file in `.tmp/stress/` (gitignored).

## Dependencies

- **Env:** `DATABASE_URL` (host/creds/port reused; DB name swapped to `sentinel_stress`). Reads `.env` via the `db:stress` script's `--env-file-if-exists`.
- **Postgres role** must be able to `CREATE DATABASE` (same capability `pnpm db:test:setup` needs).
- **Modules:** the live schemas + service functions of `persons`, `hr`, `recruitment`. It runs the production code path unmodified by overriding the connection target.
- **Migrations:** `drizzle/migrations/*.sql` (applied as-is).

## Known failure modes

- **`refusing: target DB name … does not contain "stress"`** — a guard fired; the derived name must contain `stress` and differ from dev/test. By design; do not loosen.
- **`ABORT: connected to "X", expected "sentinel_stress"`** — the connection-target override didn't take. Means something read `DATABASE_URL`/env before `run.ts` overrode it. The harness refuses to seed rather than risk the wrong DB.
- **`CREATE DATABASE` permission denied** — the Postgres role lacks `CREATEDB`. Same fix as the test DB: grant it or use a superuser-capable role locally.
- **A latency row shows `FAIL` / a plan shows `SEQ-SCAN:persons`** — that's the harness doing its job: a real scaling finding to triage, not a harness bug. Read the markdown report and the plan note.
- **Migration apply loop drifts from `drizzle/migrate.ts`** — `run.ts` keeps a deliberate, self-contained copy of the apply loop (so the throwaway tooling can never perturb the production migration path). If `migrate.ts`'s loop changes materially, mirror the change here.
