CREATE TABLE `auth_backup_codes` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `code_hash` varchar(64) NOT NULL,
  `used_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `auth_backup_codes_pk` PRIMARY KEY(`id`),
  CONSTRAINT `auth_backup_codes_user_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
);
CREATE INDEX `backup_codes_user_idx` ON `auth_backup_codes` (`user_id`);
