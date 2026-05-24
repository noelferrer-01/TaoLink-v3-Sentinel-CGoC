-- Slice 1 — Statutory ID fields on hr_employees
-- Adds the four nullable government ID columns required by compliance exports
-- (SSS R-3, BIR 2316, PhilHealth RF-1, HDMF M1-1). Mirrors v2 audited schema
-- (ref/compliance/migrations/0000_short_loners.sql:40–43) for v2→v3 data parity.
--
-- All nullable: not every employee record has these on file at hire time
-- (applicants, contractor onboarding, etc). Compliance exports surface missing
-- IDs as a per-employee warning rather than failing the whole export.
--
-- Source of truth: modules/hr/schema.ts

ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS sss_number        text,
  ADD COLUMN IF NOT EXISTS philhealth_number text,
  ADD COLUMN IF NOT EXISTS pagibig_number    text,
  ADD COLUMN IF NOT EXISTS tin_number        text;
