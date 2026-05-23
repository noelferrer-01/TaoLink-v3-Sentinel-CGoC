-- Slice 1 — compliance rate-table schema
-- Tables: comp_sss_brackets, comp_philhealth_config, comp_pagibig_config,
--         comp_wtax_brackets (+ wtax_frequency enum).
-- Postgres 16+. Hand-written (no drizzle-kit snapshot baseline — mirrors 0001 pattern).
-- Source of truth: modules/compliance/schema.ts

-- wtax_frequency enum — idempotent via DO-block (PG16 has no CREATE TYPE IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE wtax_frequency AS ENUM ('MONTHLY', 'SEMI_MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SSS: each row is one Monthly Salary Credit bracket.
-- Rate citation: SSC Resolution 560-s.2024 + SSS Circular 2024-006, effective 2025-01-01.
CREATE TABLE IF NOT EXISTS comp_sss_brackets (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  range_start           numeric(12,2) NOT NULL,
  range_end             numeric(12,2) NOT NULL,
  monthly_salary_credit numeric(12,2) NOT NULL,
  ee_share_regular      numeric(12,2) NOT NULL,
  er_share_regular      numeric(12,2) NOT NULL,
  -- WISP shares are NOT NULL (v2 used nullable + default). Seed code must
  -- explicitly insert 0.00 for non-WISP brackets (MSC < ₱20,000).
  ee_share_wisp         numeric(12,2) NOT NULL,
  er_share_wisp         numeric(12,2) NOT NULL,
  effective_date        date          NOT NULL
);
CREATE INDEX IF NOT EXISTS comp_sss_msc_idx ON comp_sss_brackets(monthly_salary_credit);
CREATE INDEX IF NOT EXISTS comp_sss_eff_idx ON comp_sss_brackets(effective_date);
CREATE UNIQUE INDEX IF NOT EXISTS comp_sss_msc_eff_uq ON comp_sss_brackets(monthly_salary_credit, effective_date);

-- PhilHealth — one config row per effective date.
-- Citation: PhilHealth Circular 2019-0009, 5% rate effective CY 2024 onwards (2026 same per PIA).
CREATE TABLE IF NOT EXISTS comp_philhealth_config (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  rate           numeric(6,4)  NOT NULL,
  floor          numeric(12,2) NOT NULL,
  ceiling        numeric(12,2) NOT NULL,
  effective_date date          NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS comp_philhealth_eff_uq ON comp_philhealth_config(effective_date);

-- Pag-IBIG — one config row per effective date.
-- Citation: HDMF Circular 460, effective 2024-02 (supersedes Circular 274).
CREATE TABLE IF NOT EXISTS comp_pagibig_config (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  ee_rate        numeric(6,4)  NOT NULL,
  er_rate        numeric(6,4)  NOT NULL,
  salary_cap     numeric(12,2) NOT NULL,
  effective_date date          NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS comp_pagibig_eff_uq ON comp_pagibig_config(effective_date);

-- BIR WTAX — bracket table, separate rows per frequency.
-- Citation: RA 10963 (TRAIN Law) Phase 2 brackets, effective 2023-01-01.
CREATE TABLE IF NOT EXISTS comp_wtax_brackets (
  id              uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  frequency       wtax_frequency   NOT NULL,
  range_start     numeric(12,2)    NOT NULL,
  range_end       numeric(12,2),   -- null = open-ended top bracket
  base_tax        numeric(12,2)    NOT NULL,
  percentage_over numeric(6,4)     NOT NULL,
  effective_date  date             NOT NULL
);
CREATE INDEX IF NOT EXISTS comp_wtax_freq_range_idx ON comp_wtax_brackets(frequency, range_start);
CREATE INDEX IF NOT EXISTS comp_wtax_eff_idx ON comp_wtax_brackets(effective_date);
