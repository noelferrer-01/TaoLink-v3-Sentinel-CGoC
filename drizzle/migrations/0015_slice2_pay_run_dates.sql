-- Slice 2 — Capture resolved cut-off and payday on each pay run.
-- Frozen at run creation (Phase 6); never retroactively rewritten by calendar changes.

ALTER TABLE pay_runs
  ADD COLUMN IF NOT EXISTS dtr_cutoff_date date,
  ADD COLUMN IF NOT EXISTS payday_date date;
