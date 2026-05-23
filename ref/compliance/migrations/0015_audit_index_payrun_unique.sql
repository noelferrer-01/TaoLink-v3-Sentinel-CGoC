-- Add composite index on audit_logs(action, entity) for filtered queries
CREATE INDEX `audit_action_entity_idx` ON `audit_logs` (`action`, `entity`);

-- Add unique constraint on pay_runs(start_date, end_date) to prevent duplicate pay periods
CREATE UNIQUE INDEX `payrun_date_range_uniq` ON `pay_runs` (`start_date`, `end_date`);
