-- Slice 3 — Make recruitment's references to employees/users ON DELETE SET NULL.
-- Employees and users are never hard-deleted in production (status-based), so
-- this is a no-op there. It matters for test isolation: the default NO ACTION
-- constraint blocked every test suite that deletes hr_employees in cleanup once
-- a recruitment applicant referenced one. SET NULL keeps the historical link
-- informational without blocking deletes.
--
-- Source of truth: modules/recruitment/schema.ts

ALTER TABLE recruitment_applicants
  DROP CONSTRAINT IF EXISTS recruitment_applicants_hired_employee_id_fkey,
  ADD CONSTRAINT recruitment_applicants_hired_employee_id_fkey
    FOREIGN KEY (hired_employee_id) REFERENCES hr_employees(id) ON DELETE SET NULL;

ALTER TABLE recruitment_applicant_documents
  DROP CONSTRAINT IF EXISTS recruitment_applicant_documents_verified_by_user_id_fkey,
  ADD CONSTRAINT recruitment_applicant_documents_verified_by_user_id_fkey
    FOREIGN KEY (verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE recruitment_blacklist
  DROP CONSTRAINT IF EXISTS recruitment_blacklist_source_employee_id_fkey,
  ADD CONSTRAINT recruitment_blacklist_source_employee_id_fkey
    FOREIGN KEY (source_employee_id) REFERENCES hr_employees(id) ON DELETE SET NULL;

ALTER TABLE recruitment_blacklist
  DROP CONSTRAINT IF EXISTS recruitment_blacklist_added_by_user_id_fkey,
  ADD CONSTRAINT recruitment_blacklist_added_by_user_id_fkey
    FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
