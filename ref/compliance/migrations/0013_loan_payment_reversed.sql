-- M-7: Add reversed_at to hr_loan_payments so payroll void uses a soft-delete
-- instead of DELETE, preserving the full audit trail of deductions and reversals.
ALTER TABLE `hr_loan_payments` ADD COLUMN `reversed_at` timestamp;
