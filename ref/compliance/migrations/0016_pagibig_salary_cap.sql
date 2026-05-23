-- Fix: Pag-IBIG mandatory salary cap ₱10,000 → ₱5,000
-- Per HDMF Circular 274 & RA 9679, mandatory EE contribution cap = 2% × ₱5,000 = ₱100/month.
-- The ₱10,000 cap was doubling deductions vs. the legal mandatory maximum.
UPDATE gov_pagibig_config SET salary_cap = '5000.00';
