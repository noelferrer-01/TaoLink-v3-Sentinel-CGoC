-- Slice 1 — HR employee master schema
-- Tables: hr_employees (+ hr_employee_status, hr_pay_frequency enums).
-- Postgres 16+. Hand-written (no drizzle-kit snapshot baseline — mirrors 0002 pattern).
-- Source of truth: modules/hr/schema.ts

-- hr_employee_status enum — idempotent via DO-block (PG16 has no CREATE TYPE IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE hr_employee_status AS ENUM (
    'applicant', 'hired', 'deployed', 'reliever', 'floating', 'on_leave', 'terminated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- hr_pay_frequency enum — idempotent via DO-block.
-- Mirror v2 (ref/compliance/migrations/0000_short_loners.sql:33-34): basic_salary +
-- pay_frequency. Daily rate is derived, not stored.
DO $$ BEGIN
  CREATE TYPE hr_pay_frequency AS ENUM ('MONTHLY', 'SEMI_MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Employee master table — one row per guard / employee in CGoC.
CREATE TABLE IF NOT EXISTS hr_employees (
  id              uuid                NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code   text                NOT NULL,                        -- CGoC-facing ID, e.g. "CG-00001"
  first_name      text                NOT NULL,
  last_name       text                NOT NULL,
  middle_name     text,
  email           text,
  phone           text,
  basic_salary    numeric(12,2)       NOT NULL,
  pay_frequency   hr_pay_frequency    NOT NULL DEFAULT 'SEMI_MONTHLY',
  status          hr_employee_status  NOT NULL DEFAULT 'hired',
  hired_on        date                NOT NULL,
  terminated_on   date,
  created_at      timestamptz         NOT NULL DEFAULT now(),
  updated_at      timestamptz         NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_code_uq    ON hr_employees(employee_code);
CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_email_uq   ON hr_employees(email);
CREATE INDEX        IF NOT EXISTS hr_employees_status_idx ON hr_employees(status);
