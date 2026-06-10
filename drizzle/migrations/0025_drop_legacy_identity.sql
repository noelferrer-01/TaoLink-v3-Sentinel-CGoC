-- Slice 3a Task 12b — physically DROP the legacy_* identity columns.
--
-- 0024 renamed the duplicated identity columns to legacy_* (recovery window:
-- data still physically present, invisible to code). The window closes here:
-- slice-3-done is tagged, the app is verified live on the Person (full suite,
-- browser walks, 50k stress harness), and no reader has needed the legacy
-- copies. After this migration the ONLY identity store is `persons`.
--
-- STATEMENT ORDER IS PART OF THE SAFETY DESIGN — do not reorder:
--   1. Gate (RAISE EXCEPTION) — every employee and applicant must resolve to a
--      Person with a usable name. If identity didn't actually make it onto the
--      Person, the legacy copies are still the only copy — abort, fix, re-run.
--   2. DROP the legacy_* columns on both role tables.
--
-- PRECONDITIONS (runbook: wiki/runbooks/0025-drop-legacy-identity.md):
--   * 0024 applied (the legacy_* columns exist; enforced by _migrations order).
--   * A fresh pg_dump exists at .tmp/backups/pre-0025-<timestamp>.sql —
--     after this commits, that dump is the ONLY copy of the legacy data.
--
-- Source of truth: modules/hr/schema.ts, modules/recruitment/schema.ts
-- Design: wiki/slices/3a-person-identity-plan.md Task 12 (12b)
-- ADR:    wiki/decisions/0017-person-centric-identity.md

-- ── 1. Gate: every role row must resolve to a usable Person identity ───────────
DO $$
DECLARE
  bad_emp integer;
  bad_app integer;
BEGIN
  SELECT count(*) INTO bad_emp
  FROM hr_employees e LEFT JOIN persons p ON p.id = e.person_id
  WHERE p.id IS NULL OR coalesce(p.first_name, '') = '' OR coalesce(p.last_name, '') = '';

  SELECT count(*) INTO bad_app
  FROM recruitment_applicants a LEFT JOIN persons p ON p.id = a.person_id
  WHERE p.id IS NULL OR coalesce(p.first_name, '') = '' OR coalesce(p.last_name, '') = '';

  IF bad_emp > 0 OR bad_app > 0 THEN
    RAISE EXCEPTION 'Person identity incomplete (% employees, % applicants without a usable Person) — refusing to drop the legacy columns.', bad_emp, bad_app;
  END IF;
END $$;

-- ── 2a. hr_employees: drop the 15 legacy identity columns ──────────────────────
-- (rdo_code intentionally STAYS — BIR compliance field owned by the role row.)
ALTER TABLE hr_employees
  DROP COLUMN legacy_first_name,
  DROP COLUMN legacy_last_name,
  DROP COLUMN legacy_middle_name,
  DROP COLUMN legacy_email,
  DROP COLUMN legacy_phone,
  DROP COLUMN legacy_date_of_birth,
  DROP COLUMN legacy_sss_number,
  DROP COLUMN legacy_philhealth_number,
  DROP COLUMN legacy_pagibig_number,
  DROP COLUMN legacy_tin_number,
  DROP COLUMN legacy_address_line1,
  DROP COLUMN legacy_address_line2,
  DROP COLUMN legacy_city,
  DROP COLUMN legacy_province,
  DROP COLUMN legacy_postal_code;

-- ── 2b. recruitment_applicants: drop the 11 legacy identity columns ────────────
ALTER TABLE recruitment_applicants
  DROP COLUMN legacy_first_name,
  DROP COLUMN legacy_middle_name,
  DROP COLUMN legacy_last_name,
  DROP COLUMN legacy_date_of_birth,
  DROP COLUMN legacy_sss_number,
  DROP COLUMN legacy_phone,
  DROP COLUMN legacy_email,
  DROP COLUMN legacy_address_line1,
  DROP COLUMN legacy_address_line2,
  DROP COLUMN legacy_city,
  DROP COLUMN legacy_province;
