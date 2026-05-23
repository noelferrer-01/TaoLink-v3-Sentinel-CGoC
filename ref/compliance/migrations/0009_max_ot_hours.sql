-- Add optional per-shift OT cap (MISS-8)
-- NULL = no cap; set to e.g. 3 to cap at 3 hrs OT per day for that shift
ALTER TABLE `att_shifts` ADD COLUMN `max_overtime_hours` INT NULL;
