# modules/compliance

## Purpose

Stores and exposes Philippine statutory rate tables (SSS, PhilHealth, Pag-IBIG, BIR WTAX) used by the payroll engine to compute mandatory deductions.

## Public API

No public API yet. Rate-lookup helpers will be exposed via `service.ts` and `index.ts` once implemented.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** none.
- **Tables:** `comp_sss_brackets`, `comp_philhealth_config`, `comp_pagibig_config`, `comp_wtax_brackets`.

## Known failure modes

### NOT NULL violation on `ee_share_wisp` / `er_share_wisp`
**Error:** `null value in column "ee_share_wisp" violates not-null constraint`
**Fix:** Seed inserts must explicitly pass `'0.00'` for both WISP columns on all sub-₱20,000 (non-WISP) brackets.

### Unique constraint violation on re-seed
**Error:** `duplicate key value violates unique constraint "comp_philhealth_eff_uq"` (or `comp_pagibig_eff_uq` / `comp_sss_msc_eff_uq`)
**Fix:** Delete rows for the target `effective_date` before inserting — the idempotency pattern mandated by the seeding task.

### `wtax_frequency` enum already exists on migration retry
**Error:** `ERROR: type "wtax_frequency" already exists`
**Fix:** Ensure the migration's down-step (or any manual rollback) includes `DROP TYPE wtax_frequency` before re-applying the migration.
