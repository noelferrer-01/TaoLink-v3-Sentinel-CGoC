ALTER TABLE `pay_ledger` DROP FOREIGN KEY `pay_ledger_employee_id_hr_employees_id_fk`;
--> statement-breakpoint
ALTER TABLE `pay_ledger` MODIFY COLUMN `employee_id` varchar(36);--> statement-breakpoint
ALTER TABLE `pay_ledger` ADD CONSTRAINT `pay_ledger_employee_id_hr_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pagibig_effective_idx` ON `gov_pagibig_config` (`effective_date`);--> statement-breakpoint
CREATE INDEX `philhealth_effective_idx` ON `gov_philhealth_config` (`effective_date`);