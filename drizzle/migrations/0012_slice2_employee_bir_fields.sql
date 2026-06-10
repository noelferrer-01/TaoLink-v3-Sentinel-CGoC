-- Slice 2 — Add BIR 2316 fields on hr_employees (rdo_code, date_of_birth, address)
-- All columns nullable: existing employees won't have this data yet; the Phase 7
-- BIR 2316 PDF export will warn on missing values rather than fail.
--
-- Source of truth: modules/hr/schema.ts

ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS rdo_code       varchar(3),
  ADD COLUMN IF NOT EXISTS date_of_birth  date,
  ADD COLUMN IF NOT EXISTS address_line1  text,
  ADD COLUMN IF NOT EXISTS address_line2  text,
  ADD COLUMN IF NOT EXISTS city           text,
  ADD COLUMN IF NOT EXISTS province       text,
  ADD COLUMN IF NOT EXISTS postal_code    varchar(4);
