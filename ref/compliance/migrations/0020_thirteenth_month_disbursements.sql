-- Migration 0020: 13th Month Disbursement Tracking
-- Records when 13th month pay has been physically disbursed to employees

CREATE TABLE hr_13th_month_disbursements (
  id VARCHAR(36) NOT NULL,
  employee_id VARCHAR(36) NOT NULL,
  year INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_by_user_id VARCHAR(36),
  notes VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_13th_emp_year (employee_id, year),
  CONSTRAINT fk_13th_employee FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_13th_paid_by FOREIGN KEY (paid_by_user_id) REFERENCES auth_users(id) ON DELETE SET NULL
);
