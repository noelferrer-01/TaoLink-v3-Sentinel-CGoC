-- Slice 3a — Nullable role FKs + employee armed flag + applicant idPending.
-- Adds `person_id` FK to hr_employees, recruitment_applicants, recruitment_blacklist;
-- adds nullable `is_armed_post` to hr_employees (backfilled from detachment post
-- type in Task 4; feeds Slice 3b readiness radar for legacy guards);
-- adds `id_pending` (NOT NULL DEFAULT false) to recruitment_applicants.
--
-- All new columns are nullable (or defaulted for idPending) — nothing reads them
-- yet. Backfill is Task 4; NOT NULL enforcement and unique indexes are Task 5;
-- column retirement is Task 12.
--
-- Source of truth: modules/hr/schema.ts, modules/recruitment/schema.ts
-- Design: wiki/slices/3-identity-and-credentials.md §5b/§5c
-- Build plan: wiki/slices/3a-person-identity-plan.md Task 3

-- hr_employees: person_id FK + is_armed_post flag
ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS person_id uuid,
  ADD COLUMN IF NOT EXISTS is_armed_post boolean;

ALTER TABLE hr_employees
  ADD CONSTRAINT hr_employees_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;

-- recruitment_applicants: person_id FK + id_pending nudge flag
ALTER TABLE recruitment_applicants
  ADD COLUMN IF NOT EXISTS person_id uuid,
  ADD COLUMN IF NOT EXISTS id_pending boolean NOT NULL DEFAULT false;

ALTER TABLE recruitment_applicants
  ADD CONSTRAINT recruitment_applicants_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;

-- recruitment_blacklist: person_id FK only (name/DOB/SSS snapshot columns kept)
ALTER TABLE recruitment_blacklist
  ADD COLUMN IF NOT EXISTS person_id uuid;

ALTER TABLE recruitment_blacklist
  ADD CONSTRAINT recruitment_blacklist_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
