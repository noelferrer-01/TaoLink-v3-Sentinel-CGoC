CREATE TABLE `hr_loan_payments` (
	`id` varchar(36) NOT NULL,
	`loan_id` varchar(36) NOT NULL,
	`ledger_id` varchar(36),
	`amount` decimal(12,2) NOT NULL,
	`payment_date` timestamp NOT NULL DEFAULT (now()),
	`source` enum('PAYROLL','MANUAL') NOT NULL DEFAULT 'MANUAL',
	`notes` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `hr_loan_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hr_loans` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`loan_type` enum('SSS_LOAN','PAGIBIG_LOAN','CASH_ADVANCE') NOT NULL,
	`principal_amount` decimal(12,2) NOT NULL,
	`balance` decimal(12,2) NOT NULL,
	`amortization_amount` decimal(12,2) NOT NULL,
	`remaining_periods` int,
	`status` enum('ACTIVE','PAID','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
	`auto_deduct` boolean NOT NULL DEFAULT true,
	`start_date` timestamp NOT NULL DEFAULT (now()),
	`notes` varchar(500),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hr_loans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `hr_employees` MODIFY COLUMN `sss_number` varchar(255);--> statement-breakpoint
ALTER TABLE `hr_employees` MODIFY COLUMN `philhealth_number` varchar(255);--> statement-breakpoint
ALTER TABLE `hr_employees` MODIFY COLUMN `pagibig_number` varchar(255);--> statement-breakpoint
ALTER TABLE `hr_employees` MODIFY COLUMN `tin_number` varchar(255);--> statement-breakpoint
ALTER TABLE `att_shifts` ADD `grace_period_minutes` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `pay_ledger` ADD `snapshot_salary` decimal(12,2);--> statement-breakpoint
ALTER TABLE `pay_ledger` ADD `snapshot_pay_frequency` varchar(20);--> statement-breakpoint
ALTER TABLE `hr_loan_payments` ADD CONSTRAINT `hr_loan_payments_loan_id_hr_loans_id_fk` FOREIGN KEY (`loan_id`) REFERENCES `hr_loans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hr_loan_payments` ADD CONSTRAINT `hr_loan_payments_ledger_id_pay_ledger_id_fk` FOREIGN KEY (`ledger_id`) REFERENCES `pay_ledger`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hr_loans` ADD CONSTRAINT `hr_loans_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `loanpay_loan_idx` ON `hr_loan_payments` (`loan_id`);--> statement-breakpoint
CREATE INDEX `loanpay_ledger_idx` ON `hr_loan_payments` (`ledger_id`);--> statement-breakpoint
CREATE INDEX `loan_employee_idx` ON `hr_loans` (`employee_id`);--> statement-breakpoint
CREATE INDEX `loan_status_idx` ON `hr_loans` (`status`);