-- Slice 3a Task 12 — Retire the duplicated identity columns. RENAME, not DROP.
--
-- `persons` is now the sole source of truth for human identity. This migration
-- renames every legacy identity column on hr_employees / recruitment_applicants
-- to legacy_<name>: the data stays physically present (one-release recovery
-- window) but disappears from the Drizzle schemas, so no code can read or write
-- it. The physical DROP is a separate, later migration (Task 12b) run only
-- after the app is verified live on the Person.
--
-- STATEMENT ORDER IS PART OF THE SAFETY DESIGN — do not reorder:
--   1. Gate (RAISE EXCEPTION on any NULL person_id) — aborts the whole
--      transaction before anything is touched.
--   2. SET NOT NULL on person_id — second gate; throws on any stray NULL.
--   3. RENAME identity columns → legacy_*; DROP NOT NULL on the renamed ones
--      so new inserts don't need them.
--   4. Drop legacy identity indexes (email uniqueness is retired by design —
--      persons.email is non-unique; name search lives on persons_fullname_trgm).
--   5. FK tightening: person_id ON DELETE SET NULL → RESTRICT (NOT NULL +
--      SET NULL is contradictory). blacklist.person_id stays SET NULL (nullable
--      by design — it keeps its own snapshot columns for retention).
--   6. btree indexes on the person_id FKs + persons(date_of_birth) — matcher /
--      join hot paths; Postgres does not auto-index FK columns.
--
-- PRECONDITIONS (runbook: wiki/runbooks/0024-retire-legacy-identity.md):
--   * `pnpm db:backfill:persons` has completed (the gate physically enforces this).
--   * A fresh pg_dump exists at .tmp/backups/pre-0024-<timestamp>.sql.
--
-- Source of truth: modules/hr/schema.ts, modules/recruitment/schema.ts
-- Design: wiki/slices/3a-person-identity-plan.md Task 12
-- ADR:    wiki/decisions/0017-person-centric-identity.md

-- ── 1. Gate: refuse to run on an un-backfilled database ────────────────────────
DO $$ BEGIN
  IF (SELECT count(*) FROM hr_employees WHERE person_id IS NULL) > 0
     OR (SELECT count(*) FROM recruitment_applicants WHERE person_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete — refusing to retire identity columns.';
  END IF;
END $$;

-- ── 2. Second gate: person_id becomes NOT NULL on both role tables ─────────────
ALTER TABLE hr_employees           ALTER COLUMN person_id SET NOT NULL;
ALTER TABLE recruitment_applicants ALTER COLUMN person_id SET NOT NULL;

-- ── 3a. hr_employees: rename identity columns → legacy_* ───────────────────────
-- (rdo_code intentionally STAYS — it is a BIR compliance field owned by the
--  employee role, not personal identity.)
ALTER TABLE hr_employees RENAME COLUMN first_name        TO legacy_first_name;
ALTER TABLE hr_employees RENAME COLUMN last_name         TO legacy_last_name;
ALTER TABLE hr_employees RENAME COLUMN middle_name       TO legacy_middle_name;
ALTER TABLE hr_employees RENAME COLUMN email             TO legacy_email;
ALTER TABLE hr_employees RENAME COLUMN phone             TO legacy_phone;
ALTER TABLE hr_employees RENAME COLUMN date_of_birth     TO legacy_date_of_birth;
ALTER TABLE hr_employees RENAME COLUMN sss_number        TO legacy_sss_number;
ALTER TABLE hr_employees RENAME COLUMN philhealth_number TO legacy_philhealth_number;
ALTER TABLE hr_employees RENAME COLUMN pagibig_number    TO legacy_pagibig_number;
ALTER TABLE hr_employees RENAME COLUMN tin_number        TO legacy_tin_number;
ALTER TABLE hr_employees RENAME COLUMN address_line1     TO legacy_address_line1;
ALTER TABLE hr_employees RENAME COLUMN address_line2     TO legacy_address_line2;
ALTER TABLE hr_employees RENAME COLUMN city              TO legacy_city;
ALTER TABLE hr_employees RENAME COLUMN province          TO legacy_province;
ALTER TABLE hr_employees RENAME COLUMN postal_code       TO legacy_postal_code;

-- Formerly NOT NULL → nullable, so new inserts never need legacy columns.
ALTER TABLE hr_employees ALTER COLUMN legacy_first_name DROP NOT NULL;
ALTER TABLE hr_employees ALTER COLUMN legacy_last_name  DROP NOT NULL;

-- ── 3b. recruitment_applicants: rename identity columns → legacy_* ─────────────
-- (Applicant-specific non-identity columns — source, stage, applied_on, notes,
--  is_armed_post, position_applied_for, id_pending — all STAY.)
ALTER TABLE recruitment_applicants RENAME COLUMN first_name    TO legacy_first_name;
ALTER TABLE recruitment_applicants RENAME COLUMN middle_name   TO legacy_middle_name;
ALTER TABLE recruitment_applicants RENAME COLUMN last_name     TO legacy_last_name;
ALTER TABLE recruitment_applicants RENAME COLUMN date_of_birth TO legacy_date_of_birth;
ALTER TABLE recruitment_applicants RENAME COLUMN sss_number    TO legacy_sss_number;
ALTER TABLE recruitment_applicants RENAME COLUMN phone         TO legacy_phone;
ALTER TABLE recruitment_applicants RENAME COLUMN email         TO legacy_email;
ALTER TABLE recruitment_applicants RENAME COLUMN address_line1 TO legacy_address_line1;
ALTER TABLE recruitment_applicants RENAME COLUMN address_line2 TO legacy_address_line2;
ALTER TABLE recruitment_applicants RENAME COLUMN city          TO legacy_city;
ALTER TABLE recruitment_applicants RENAME COLUMN province      TO legacy_province;

ALTER TABLE recruitment_applicants ALTER COLUMN legacy_first_name DROP NOT NULL;
ALTER TABLE recruitment_applicants ALTER COLUMN legacy_last_name  DROP NOT NULL;

-- (recruitment_blacklist keeps its first_name/last_name/date_of_birth/sss_number
--  snapshot columns by design — retention record, not live identity.)

-- ── 4. Drop legacy identity indexes ─────────────────────────────────────────────
-- hr_employees_email_uq is a UNIQUE INDEX from 0003 (not a constraint — verified
-- against the live catalog). Email uniqueness is retired: persons.email is
-- non-unique by design (adversarial-review outcome).
DROP INDEX IF EXISTS hr_employees_email_uq;
-- Name search moved to persons_fullname_trgm (0021).
DROP INDEX IF EXISTS hr_employees_fullname_trgm;
-- Applicant list search now joins persons; the legacy name index is dead weight.
DROP INDEX IF EXISTS recruitment_applicants_lastname_idx;

-- ── 5. FK tightening: SET NULL → RESTRICT on the now-NOT NULL FKs ──────────────
ALTER TABLE hr_employees
  DROP CONSTRAINT hr_employees_person_id_fkey;
ALTER TABLE hr_employees
  ADD CONSTRAINT hr_employees_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT;

ALTER TABLE recruitment_applicants
  DROP CONSTRAINT recruitment_applicants_person_id_fkey;
ALTER TABLE recruitment_applicants
  ADD CONSTRAINT recruitment_applicants_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT;

-- recruitment_blacklist.person_id keeps ON DELETE SET NULL (nullable by design).

-- ── 6. FK / matcher hot-path indexes (parked from the T11 review) ───────────────
CREATE INDEX IF NOT EXISTS hr_employees_person_id_idx           ON hr_employees (person_id);
CREATE INDEX IF NOT EXISTS recruitment_applicants_person_id_idx ON recruitment_applicants (person_id);
CREATE INDEX IF NOT EXISTS recruitment_blacklist_person_id_idx  ON recruitment_blacklist (person_id);
CREATE INDEX IF NOT EXISTS persons_dob_idx                      ON persons (date_of_birth);
