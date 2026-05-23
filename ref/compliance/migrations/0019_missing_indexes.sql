-- Add missing indexes on FK columns that are used in lookups but have no index.

-- auth_sessions.user_id: used on every session validation (high-frequency query)
CREATE INDEX auth_session_user_idx ON auth_sessions(user_id);

-- lv_leave_applications.approved_by_id: used when listing approvals by approver
CREATE INDEX leave_app_approver_idx ON lv_leave_applications(approved_by_id);
