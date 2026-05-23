CREATE TABLE `hr_departments` (
	`id` varchar(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`code` varchar(20) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hr_departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `code_idx` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `hr_employees` (
	`id` varchar(36) NOT NULL,
	`employee_number` varchar(50) NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`middle_name` varchar(100),
	`email` varchar(255),
	`status` enum('ACTIVE','INACTIVE','TERMINATED') NOT NULL DEFAULT 'ACTIVE',
	`birth_date` date,
	`gender` enum('MALE','FEMALE','OTHER'),
	`civil_status` enum('SINGLE','MARRIED','WIDOWED','DIVORCED'),
	`citizenship` varchar(50) DEFAULT 'Filipino',
	`religion` varchar(50),
	`address_line1` varchar(255),
	`address_line2` varchar(255),
	`barangay` varchar(100),
	`city` varchar(100),
	`province` varchar(100),
	`zip_code` varchar(10),
	`bank_name` varchar(100),
	`bank_account_name` varchar(100),
	`bank_account_number` varchar(255),
	`basic_salary` decimal(12,2) NOT NULL,
	`pay_frequency` enum('MONTHLY','SEMI_MONTHLY') DEFAULT 'SEMI_MONTHLY',
	`is_minimum_wage` boolean DEFAULT false,
	`has_sss` boolean DEFAULT true,
	`has_philhealth` boolean DEFAULT true,
	`has_pagibig` boolean DEFAULT true,
	`has_wtax` boolean DEFAULT true,
	`sss_number` varchar(20),
	`philhealth_number` varchar(20),
	`pagibig_number` varchar(20),
	`tin_number` varchar(20),
	`gov_ids_verified` boolean DEFAULT false,
	`gov_ids_verified_at` timestamp,
	`gov_ids_verified_by` varchar(36),
	`department_id` varchar(36),
	`position_id` varchar(36),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hr_employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_number_idx` UNIQUE(`employee_number`)
);
--> statement-breakpoint
CREATE TABLE `hr_positions` (
	`id` varchar(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`department_id` varchar(36),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hr_positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hr_salary_history` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`previous_salary` decimal(12,2) NOT NULL,
	`new_salary` decimal(12,2) NOT NULL,
	`effective_date` date NOT NULL,
	`reason` varchar(255),
	`changed_by` varchar(36),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `hr_salary_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gov_de_minimis_ceilings` (
	`id` varchar(36) NOT NULL,
	`benefit_name` varchar(100) NOT NULL,
	`monthly_ceiling` decimal(12,2) NOT NULL,
	`code` varchar(50) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gov_de_minimis_ceilings_id` PRIMARY KEY(`id`),
	CONSTRAINT `benefit_code_idx` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `gov_pagibig_config` (
	`id` varchar(36) NOT NULL,
	`ee_rate` decimal(5,4) NOT NULL,
	`er_rate` decimal(5,4) NOT NULL,
	`salary_cap` decimal(12,2) NOT NULL,
	`effective_date` date NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `gov_pagibig_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gov_philhealth_config` (
	`id` varchar(36) NOT NULL,
	`rate` decimal(5,4) NOT NULL,
	`floor` decimal(12,2) NOT NULL,
	`ceiling` decimal(12,2) NOT NULL,
	`effective_date` date NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `gov_philhealth_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gov_sss_contribution_table` (
	`id` varchar(36) NOT NULL,
	`range_start` decimal(12,2) NOT NULL,
	`range_end` decimal(12,2) NOT NULL,
	`msc` decimal(12,2) NOT NULL,
	`ee_share_regular` decimal(10,2) NOT NULL,
	`er_share_regular` decimal(10,2) NOT NULL,
	`ee_share_wisp` decimal(10,2) DEFAULT '0.00',
	`er_share_wisp` decimal(10,2) DEFAULT '0.00',
	`effective_date` date NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `gov_sss_contribution_table_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gov_wtax_table` (
	`id` varchar(36) NOT NULL,
	`frequency` varchar(20) NOT NULL,
	`range_start` decimal(12,2) NOT NULL,
	`range_end` decimal(12,2),
	`base_tax` decimal(12,2) NOT NULL,
	`percentage_over` decimal(5,4) NOT NULL,
	`effective_date` date NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `gov_wtax_table_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gov_holidays` (
	`id` varchar(36) NOT NULL,
	`name` varchar(150) NOT NULL,
	`holiday_date` date NOT NULL,
	`type` enum('REGULAR','SPECIAL_NON_WORKING','SPECIAL_WORKING') NOT NULL,
	`worked_multiplier` decimal(4,2) NOT NULL,
	`unworked_multiplier` decimal(4,2) NOT NULL,
	`year` varchar(4) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gov_holidays_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `att_attendance_summaries` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`attendance_date` date NOT NULL,
	`first_in` timestamp,
	`last_out` timestamp,
	`total_hours` decimal(5,2) DEFAULT '0.00',
	`late_minutes` decimal(7,2) DEFAULT '0.00',
	`undertime_minutes` decimal(7,2) DEFAULT '0.00',
	`overtime_minutes` decimal(7,2) DEFAULT '0.00',
	`nsd_minutes` decimal(7,2) DEFAULT '0.00',
	`is_absent` boolean NOT NULL DEFAULT false,
	`is_paid_leave` boolean DEFAULT false,
	`status` enum('PENDING','VERIFIED','POSTED','LEAVE','ABSENT') NOT NULL DEFAULT 'PENDING',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `att_attendance_summaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `att_summary_emp_date_idx` UNIQUE(`employee_id`,`attendance_date`)
);
--> statement-breakpoint
CREATE TABLE `att_raw_logs` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`log_timestamp` timestamp NOT NULL,
	`log_type` enum('IN','OUT') NOT NULL,
	`source` varchar(50) DEFAULT 'WEB',
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `att_raw_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `att_schedules` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`shift_id` varchar(36) NOT NULL,
	`effective_date` date NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `att_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `att_shifts` (
	`id` varchar(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`start_time` time NOT NULL,
	`end_time` time NOT NULL,
	`lunch_break_minutes` int DEFAULT 60,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `att_shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pay_items` (
	`id` varchar(36) NOT NULL,
	`ledger_id` varchar(36) NOT NULL,
	`item_type` enum('EARNING','DEDUCTION','STATUTORY_ER') NOT NULL,
	`name` varchar(100) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`description` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pay_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pay_ledger` (
	`id` varchar(36) NOT NULL,
	`pay_run_id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`gross_pay` decimal(12,2) NOT NULL DEFAULT '0.00',
	`total_deductions` decimal(12,2) NOT NULL DEFAULT '0.00',
	`net_pay` decimal(12,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pay_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_run_emp_idx` UNIQUE(`pay_run_id`,`employee_id`)
);
--> statement-breakpoint
CREATE TABLE `pay_runs` (
	`id` varchar(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`status` enum('DRAFT','LOCKED','PAID') NOT NULL DEFAULT 'DRAFT',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pay_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lv_leave_applications` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`leave_type_id` varchar(36) NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`days_count` decimal(5,2) NOT NULL,
	`reason` varchar(255),
	`status` enum('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`approved_by_id` varchar(36),
	`approved_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lv_leave_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lv_leave_credits` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`leave_type_id` varchar(36) NOT NULL,
	`total_credits` decimal(5,2) DEFAULT '0.00',
	`total_used` decimal(5,2) DEFAULT '0.00',
	`year` varchar(4) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lv_leave_credits_id` PRIMARY KEY(`id`),
	CONSTRAINT `credit_emp_type_year_idx` UNIQUE(`employee_id`,`leave_type_id`,`year`)
);
--> statement-breakpoint
CREATE TABLE `lv_leave_types` (
	`id` varchar(36) NOT NULL,
	`name` varchar(100) NOT NULL,
	`code` varchar(20) NOT NULL,
	`is_paid` boolean DEFAULT true,
	`description` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lv_leave_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `lv_leave_types_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` varchar(128) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`hashed_password` varchar(255),
	`role` enum('SUPER_ADMIN','HR_ADMIN','MANAGER','EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
	`employee_id` varchar(36),
	`totp_secret` varchar(255),
	`totp_enabled` boolean DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auth_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`action` varchar(50) NOT NULL,
	`entity` varchar(50) NOT NULL,
	`entity_id` varchar(36),
	`changes` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sys_configs` (
	`id` varchar(255) NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`category` varchar(100) NOT NULL DEFAULT 'GENERAL',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sys_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `sys_configs_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit_attempts` (
	`id` varchar(36) NOT NULL,
	`key` varchar(255) NOT NULL,
	`attempts` int NOT NULL DEFAULT 1,
	`reset_at` timestamp NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rate_limit_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `hr_employees` ADD CONSTRAINT `hr_employees_department_id_hr_departments_id_fk` FOREIGN KEY (`department_id`) REFERENCES `hr_departments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hr_employees` ADD CONSTRAINT `hr_employees_position_id_hr_positions_id_fk` FOREIGN KEY (`position_id`) REFERENCES `hr_positions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hr_positions` ADD CONSTRAINT `hr_positions_department_id_hr_departments_id_fk` FOREIGN KEY (`department_id`) REFERENCES `hr_departments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hr_salary_history` ADD CONSTRAINT `hr_salary_history_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `att_attendance_summaries` ADD CONSTRAINT `att_attendance_summaries_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `att_raw_logs` ADD CONSTRAINT `att_raw_logs_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `att_schedules` ADD CONSTRAINT `att_schedules_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `att_schedules` ADD CONSTRAINT `att_schedules_shift_id_att_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `att_shifts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pay_items` ADD CONSTRAINT `pay_items_ledger_id_pay_ledger_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `pay_ledger`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pay_ledger` ADD CONSTRAINT `pay_ledger_pay_run_id_pay_runs_id_fk` FOREIGN KEY (`pay_run_id`) REFERENCES `pay_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pay_ledger` ADD CONSTRAINT `pay_ledger_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lv_leave_applications` ADD CONSTRAINT `lv_leave_applications_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lv_leave_applications` ADD CONSTRAINT `lv_leave_applications_leave_type_id_lv_leave_types_id_fk` FOREIGN KEY (`leave_type_id`) REFERENCES `lv_leave_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lv_leave_applications` ADD CONSTRAINT `lv_leave_applications_approved_by_id_hr_employees_id_fk` FOREIGN KEY (`approved_by_id`) REFERENCES `hr_employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lv_leave_credits` ADD CONSTRAINT `lv_leave_credits_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lv_leave_credits` ADD CONSTRAINT `lv_leave_credits_leave_type_id_lv_leave_types_id_fk` FOREIGN KEY (`leave_type_id`) REFERENCES `lv_leave_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_auth_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_users` ADD CONSTRAINT `auth_users_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_auth_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `emp_department_idx` ON `hr_employees` (`department_id`);--> statement-breakpoint
CREATE INDEX `emp_position_idx` ON `hr_employees` (`position_id`);--> statement-breakpoint
CREATE INDEX `emp_status_idx` ON `hr_employees` (`status`);--> statement-breakpoint
CREATE INDEX `pos_department_idx` ON `hr_positions` (`department_id`);--> statement-breakpoint
CREATE INDEX `salary_hist_emp_idx` ON `hr_salary_history` (`employee_id`);--> statement-breakpoint
CREATE INDEX `salary_hist_date_idx` ON `hr_salary_history` (`effective_date`);--> statement-breakpoint
CREATE INDEX `sss_effective_idx` ON `gov_sss_contribution_table` (`effective_date`);--> statement-breakpoint
CREATE INDEX `wtax_freq_idx` ON `gov_wtax_table` (`frequency`);--> statement-breakpoint
CREATE INDEX `holiday_date_idx` ON `gov_holidays` (`holiday_date`);--> statement-breakpoint
CREATE INDEX `holiday_year_idx` ON `gov_holidays` (`year`);--> statement-breakpoint
CREATE INDEX `rawlog_employee_idx` ON `att_raw_logs` (`employee_id`);--> statement-breakpoint
CREATE INDEX `rawlog_timestamp_idx` ON `att_raw_logs` (`employee_id`,`log_timestamp`);--> statement-breakpoint
CREATE INDEX `sched_employee_idx` ON `att_schedules` (`employee_id`);--> statement-breakpoint
CREATE INDEX `sched_shift_idx` ON `att_schedules` (`shift_id`);--> statement-breakpoint
CREATE INDEX `item_ledger_idx` ON `pay_items` (`ledger_id`);--> statement-breakpoint
CREATE INDEX `payrun_date_idx` ON `pay_runs` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `leave_app_emp_status_idx` ON `lv_leave_applications` (`employee_id`,`status`);--> statement-breakpoint
CREATE INDEX `auth_employee_idx` ON `auth_users` (`employee_id`);--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `rate_limit_key_idx` ON `rate_limit_attempts` (`key`);