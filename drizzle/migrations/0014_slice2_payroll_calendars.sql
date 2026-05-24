-- Slice 2 — payroll_calendars table + clients.default_payroll_calendar_id FK.
-- Drives the DTR cut-off and payday countdown badges (Phase 6 + Phase 9).

CREATE TYPE payroll_frequency AS ENUM ('WEEKLY', 'SEMI_MONTHLY', 'MONTHLY');

CREATE TABLE IF NOT EXISTS payroll_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id),
  name text NOT NULL,
  frequency payroll_frequency NOT NULL DEFAULT 'SEMI_MONTHLY',
  dtr_cutoff_days_after_period_end integer NOT NULL DEFAULT 2,
  payday_days_after_period_end integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS default_payroll_calendar_id uuid REFERENCES payroll_calendars(id);
