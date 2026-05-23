CREATE TABLE `bg_jobs` (
  `id` varchar(36) NOT NULL,
  `type` enum('PAYROLL_GENERATION','ATTENDANCE_PROCESSING') NOT NULL,
  `status` enum('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  `payload` json NOT NULL,
  `progress` int DEFAULT 0,
  `processed_count` int DEFAULT 0,
  `total_count` int DEFAULT 0,
  `error_message` text,
  `started_at` timestamp,
  `completed_at` timestamp,
  `created_by` varchar(36),
  `created_at` timestamp DEFAULT (now()),
  CONSTRAINT `bg_jobs_pk` PRIMARY KEY(`id`)
);

CREATE INDEX `bg_jobs_status_created_idx` ON `bg_jobs` (`status`, `created_at`);
