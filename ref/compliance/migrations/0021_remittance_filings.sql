CREATE TABLE `gov_remittance_filings` (
	`id` varchar(36) NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`agency` varchar(20) NOT NULL,
	`amount` decimal(12,2),
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	`filed_at` timestamp,
	`paid_at` timestamp,
	`reference_number` varchar(100),
	`notes` varchar(255),
	`created_by_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gov_remittance_filings_pk` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_filing_period_agency` UNIQUE(`year`,`month`,`agency`)
);
