-- Slice 1 — Assignments schema
-- Table: assignments.
-- Postgres 16+. Hand-written (no drizzle-kit snapshot baseline — mirrors 0004 pattern).
-- Source of truth: modules/assignments/schema.ts

-- Assignment master table — one row per employee-detachment deployment period.
CREATE TABLE IF NOT EXISTS assignments (
  id              uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES hr_employees(id) ON DELETE RESTRICT,
  detachment_id   uuid        NOT NULL REFERENCES detachments(id) ON DELETE RESTRICT,
  start_date      date        NOT NULL,
  end_date        date,
  end_reason      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignments_emp_date_idx  ON assignments (employee_id, start_date);
CREATE INDEX IF NOT EXISTS assignments_det_idx        ON assignments (detachment_id);
