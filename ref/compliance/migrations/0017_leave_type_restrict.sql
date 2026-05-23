-- Fix: Leave type FK cascade → RESTRICT
-- Deleting a leave type currently cascade-deletes ALL applications and credit records,
-- destroying audit history. RESTRICT forces HR to reassign/archive records first.
ALTER TABLE lv_leave_applications
  DROP FOREIGN KEY lv_leave_applications_leave_type_id_lv_leave_types_id_fk;
ALTER TABLE lv_leave_applications
  ADD CONSTRAINT lv_leave_applications_leave_type_id_lv_leave_types_id_fk
    FOREIGN KEY (leave_type_id) REFERENCES lv_leave_types(id) ON DELETE RESTRICT;

ALTER TABLE lv_leave_credits
  DROP FOREIGN KEY lv_leave_credits_leave_type_id_lv_leave_types_id_fk;
ALTER TABLE lv_leave_credits
  ADD CONSTRAINT lv_leave_credits_leave_type_id_lv_leave_types_id_fk
    FOREIGN KEY (leave_type_id) REFERENCES lv_leave_types(id) ON DELETE RESTRICT;
