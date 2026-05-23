-- Restore Pag-IBIG Maximum Fund Salary (MFS) cap to ₱10,000.
-- Per HDMF Circular No. 460 (released 2024-01-15, effective February 2024), the MFS
-- used to compute mandatory 2% employee + 2% employer contributions was raised from
-- ₱5,000 to ₱10,000 — superseding Circular 274.
--
-- Migration 0016 incorrectly rolled the cap back to ₱5,000 citing the obsolete
-- Circular 274. With cap = ₱5,000, max EE/ER contribution is ₱100/month each;
-- with the legally-current cap = ₱10,000, max is ₱200/month each.
--
-- Approach: delete the row inserted by 0016 (factually incorrect for every payroll
-- period after Feb 2024) and insert a single correct row with effective_date set
-- to the actual legal effective date of Circular 460. The payroll engine picks
-- the latest row whose effective_date ≤ run end-date, so this gives the right
-- answer for any run from Feb 2024 onward.
--
-- Sources:
--  - pco.gov.ph press release "Pag-IBIG members to gain more benefits under new
--    rates starting February 2024" (17 January 2024)
--  - HDMF Circular No. 460 — Guidelines on the Pag-IBIG Fund's Implementation of
--    Increase in the MFS Effective February 2024

DELETE FROM `gov_pagibig_config` WHERE `salary_cap` = '5000.00';
--> statement-breakpoint
INSERT INTO `gov_pagibig_config` (`id`, `ee_rate`, `er_rate`, `salary_cap`, `effective_date`)
VALUES (UUID(), '0.0200', '0.0200', '10000.00', '2024-02-01');
