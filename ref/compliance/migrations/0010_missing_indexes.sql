-- PERF-02: Add missing indexes for 10k-employee scale
-- pay_ledger.employee_id: used by ESS payslip list and employee payroll history queries
CREATE INDEX `ledger_employee_idx` ON `pay_ledger` (`employee_id`);

-- hr_loans.(employee_id, status): compound index for payroll batch loan fetch
-- WHERE employee_id IN (...) AND status = 'ACTIVE'
CREATE INDEX `loan_emp_status_idx` ON `hr_loans` (`employee_id`, `status`);
