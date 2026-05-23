-- Fix SEC-2: Promote rate_limit_key_idx from a plain INDEX to a UNIQUE INDEX.
-- Prevents concurrent login requests from the same IP/user from each inserting
-- a new row (bypassing the per-window attempt cap via the race window between
-- "no existing row" check and INSERT). ER_DUP_ENTRY is now caught in code and
-- the request falls through to the normal increment path.
ALTER TABLE `rate_limit_attempts`
  DROP INDEX `rate_limit_key_idx`,
  ADD UNIQUE INDEX `rate_limit_key_idx` (`key`);
