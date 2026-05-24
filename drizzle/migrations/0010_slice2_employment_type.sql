-- Slice 2 — Add employment_type enum + column on hr_employees
-- Classifies each employee's role type for reporting, filtering, and future
-- deployment logic (guards vs office staff vs supervisors, etc.).
-- Default 'GUARD' bacfills all existing rows without a separate UPDATE.
--
-- Source of truth: modules/hr/schema.ts

CREATE TYPE employment_type AS ENUM (
  'GUARD',
  'OFFICE_STAFF',
  'SUPERVISOR',
  'DRIVER',
  'JANITOR',
  'OTHER'
);

ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS employment_type employment_type NOT NULL DEFAULT 'GUARD';
