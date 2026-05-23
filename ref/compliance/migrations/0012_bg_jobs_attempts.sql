-- M-5: Add attempt_count to bg_jobs so the stale-job recovery can detect crash-loop jobs
-- and permanently fail them instead of retrying indefinitely.
ALTER TABLE `bg_jobs` ADD COLUMN `attempt_count` int NOT NULL DEFAULT 0;
