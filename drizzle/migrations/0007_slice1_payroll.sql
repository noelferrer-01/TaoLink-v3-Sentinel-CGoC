-- Slice 1 — Payroll schema
-- Tables: pay_runs, payslips.
-- Enums: pay_run_status.
-- Postgres 16+. Hand-written (no drizzle-kit snapshot baseline — mirrors 0006 pattern).
-- Source of truth: modules/payroll/schema.ts
--
-- FK policy:
--   payslips.pay_run_id → pay_runs(id) ON DELETE CASCADE.
--     Payslips have no meaning without their parent pay run; cascade keeps the DB clean.
--   payslips.employee_id → hr_employees(id) NO ACTION (default).
--     Conservative stance: a payslip referencing a deleted employee is an error state;
--     we want it to surface as an FK violation, not silently NULL out.
--     Matches the DTR and assignments conservative stance.

-- pay_run_status enum — idempotent via DO-block (PG16 has no CREATE TYPE IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE pay_run_status AS ENUM ('draft', 'calculated', 'locked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Pay runs — one row per payroll period.
CREATE TABLE IF NOT EXISTS pay_runs (
  id                  uuid           NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start        date           NOT NULL,
  period_end          date           NOT NULL,
  status              pay_run_status NOT NULL DEFAULT 'draft',
  work_days_per_month integer        NOT NULL DEFAULT 26,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  calculated_at       timestamptz,
  locked_at           timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS pay_runs_period_uq ON pay_runs (period_start, period_end);

-- Payslips — one row per employee per pay run.
CREATE TABLE IF NOT EXISTS payslips (
  id                     uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_run_id             uuid        NOT NULL REFERENCES pay_runs(id) ON DELETE CASCADE,
  employee_id            uuid        NOT NULL REFERENCES hr_employees(id),
  days_worked            numeric(6,2)  NOT NULL,
  ot_hours               numeric(6,2)  NOT NULL DEFAULT 0,
  basic_salary_snapshot  numeric(12,2) NOT NULL,
  pay_frequency_snapshot text          NOT NULL,
  gross_pay              numeric(12,2) NOT NULL,
  sss_ee                 numeric(12,2) NOT NULL,
  philhealth_ee          numeric(12,2) NOT NULL,
  pagibig_ee             numeric(12,2) NOT NULL,
  bir_wtax               numeric(12,2) NOT NULL,
  net_pay                numeric(12,2) NOT NULL,
  breakdown              jsonb         NOT NULL,
  created_at             timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payslips_run_emp_uq ON payslips (pay_run_id, employee_id);
