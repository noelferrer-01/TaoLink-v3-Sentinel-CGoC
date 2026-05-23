-- Slice 1 — Daily Time Record (DTR) schema
-- Tables: dtr_entries, dtr_period_closes.
-- Enums: dtr_status.
-- Postgres 16+. Hand-written (no drizzle-kit snapshot baseline — mirrors 0005 pattern).
-- Source of truth: modules/dtr/schema.ts
--
-- FK policy: NO ACTION (default) on both FKs in dtr_entries.
-- A DTR row referencing a deleted employee or assignment is an error state;
-- we want it to surface as an FK violation, not silently NULL out.
-- This matches the conservative stance taken on assignments→employees (ON DELETE RESTRICT).

-- dtr_status enum — idempotent via DO-block (PG16 has no CREATE TYPE IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE dtr_status AS ENUM ('worked', 'absent', 'leave', 'holiday_worked', 'restday_worked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DTR entries — one row per employee per calendar date.
CREATE TABLE IF NOT EXISTS dtr_entries (
  id            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid        NOT NULL REFERENCES hr_employees(id),
  assignment_id uuid                 REFERENCES assignments(id),
  date          date        NOT NULL,
  time_in       time,
  time_out      time,
  status        dtr_status  NOT NULL DEFAULT 'worked',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dtr_emp_date_uq     ON dtr_entries (employee_id, date);
CREATE INDEX        IF NOT EXISTS dtr_date_idx         ON dtr_entries (date);
CREATE INDEX        IF NOT EXISTS dtr_assignment_idx   ON dtr_entries (assignment_id);

-- Period-close registry — one row per closed payroll period.
CREATE TABLE IF NOT EXISTS dtr_period_closes (
  id           uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date        NOT NULL,
  period_end   date        NOT NULL,
  closed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dtr_period_close_uq ON dtr_period_closes (period_start, period_end);
