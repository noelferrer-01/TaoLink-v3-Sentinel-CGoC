CREATE INDEX `rawlog_selfie_path_idx` ON `att_raw_logs` (`selfie_path`);--> statement-breakpoint
CREATE INDEX `bg_jobs_status_completed_idx` ON `bg_jobs` (`status`,`completed_at`);
