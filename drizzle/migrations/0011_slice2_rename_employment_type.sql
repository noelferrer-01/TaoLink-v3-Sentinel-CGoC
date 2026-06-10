-- Slice 2: rename employment_type enum to hr_employment_type for namespace consistency
-- (matches the hr_ prefix used by hr_employee_status and hr_pay_frequency).
ALTER TYPE employment_type RENAME TO hr_employment_type;
