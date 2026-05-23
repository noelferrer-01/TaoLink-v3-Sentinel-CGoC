-- Fix: att_schedules.shift_id -> nullable + SET NULL FK
-- Previously shift_id had no FK (only an index). Make it nullable and add proper FK
-- so deleting a shift sets shift_id to NULL instead of blocking or cascading.
ALTER TABLE att_schedules MODIFY COLUMN shift_id VARCHAR(36) NULL;
ALTER TABLE att_schedules
  ADD CONSTRAINT att_schedules_shift_id_att_shifts_id_fk
    FOREIGN KEY (shift_id) REFERENCES att_shifts(id) ON DELETE SET NULL;
