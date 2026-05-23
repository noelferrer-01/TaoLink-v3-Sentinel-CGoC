-- work_days: JSON array of ISO weekday numbers that are working days for this shift.
-- e.g. [1,2,3,4,5] = Mon–Fri,  [1,2,3,4,5,6] = Mon–Sat
-- NULL = not yet configured; system defaults to Mon–Fri ([1,2,3,4,5]) in application code.
ALTER TABLE `att_shifts`
  ADD COLUMN `work_days` JSON NULL;

-- is_rest_day: TRUE when the attendance date falls outside the employee's shift work_days.
-- Populated by the attendance worker; consumed by the payroll service to apply 1.69x OT rate.
ALTER TABLE `att_attendance_summaries`
  ADD COLUMN `is_rest_day` BOOLEAN NOT NULL DEFAULT FALSE;
