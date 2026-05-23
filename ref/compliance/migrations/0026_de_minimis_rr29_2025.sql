-- Seed gov_de_minimis_ceilings with the current statutory values from BIR
-- Revenue Regulations No. 29-2025 (issued 22 December 2025, effective 6 January
-- 2026), which amended RR 2-98 to raise the non-taxable thresholds for nine
-- categories of employee de minimis benefits.
--
-- The table was created in migration 0000 but never populated. Existing TAOLINK
-- payroll runs silently treated *all* de minimis allowances as zero, meaning any
-- such benefit paid out went into taxable income — over-withholding income tax
-- and over-stating gross taxable compensation on BIR Form 2316.
--
-- Stored as monthly ceilings; annual benefits are divided by 12 below. The
-- OT/night-shift meal allowance (30% of basic minimum wage) is excluded because
-- it is wage-percentage-based, not a fixed peso ceiling, and is computed at
-- runtime by the payroll engine.
--
-- Source: BIR RR No. 29-2025 (https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2029-2025.pdf).
--
-- Idempotent: ON DUPLICATE KEY UPDATE on the unique `code` column so this
-- migration is safe to apply against a DB that already has any subset of these
-- rows (e.g. a DB seeded after this code change merged).

INSERT INTO `gov_de_minimis_ceilings` (`id`, `code`, `benefit_name`, `monthly_ceiling`) VALUES
  (UUID(), 'UNIFORM',        'Uniform and clothing allowance',                     666.67),
  (UUID(), 'RICE',           'Rice subsidy',                                       2500.00),
  (UUID(), 'MEDICAL_CASH',   'Medical cash allowance for dependents',              333.33),
  (UUID(), 'MEDICAL_ACTUAL', 'Actual medical assistance',                          1000.00),
  (UUID(), 'LAUNDRY',        'Laundry allowance',                                  400.00),
  (UUID(), 'ACHIEVEMENT',    'Employee achievement awards (cash, GC, tangible)',   1000.00),
  (UUID(), 'GIFTS',          'Christmas and major anniversary gifts',              500.00),
  (UUID(), 'CBA',            'CBA benefits and productivity incentive schemes',    1000.00)
ON DUPLICATE KEY UPDATE
  `benefit_name`    = VALUES(`benefit_name`),
  `monthly_ceiling` = VALUES(`monthly_ceiling`);
