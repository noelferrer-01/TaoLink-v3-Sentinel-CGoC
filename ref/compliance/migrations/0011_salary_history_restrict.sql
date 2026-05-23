-- INTEG-01: Protect salary audit trail from cascade deletes.
-- Previously: deleting an employee would cascade-delete all salary history (destroys BIR audit trail).
-- Now: DELETE is blocked if salary history records exist — admin must archive the employee instead.
ALTER TABLE `hr_salary_history`
  DROP FOREIGN KEY `hr_salary_history_employee_id_hr_employees_id_fk`;
ALTER TABLE `hr_salary_history`
  ADD CONSTRAINT `hr_salary_history_employee_id_hr_employees_id_fk`
    FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE RESTRICT;
