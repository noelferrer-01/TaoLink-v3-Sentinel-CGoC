-- Slice 2 — composite index on audit_log for target lookups, used by
-- hr.getLatestTerminationTimestamp() on every terminated-employee detail-page
-- load. Without this index, the query against (action, target_kind, target_id)
-- degrades to a sequential scan as audit volume grows. Composite covers the
-- ORDER BY created_at DESC too.

CREATE INDEX IF NOT EXISTS audit_log_target_idx
  ON audit_log (target_kind, target_id, action, created_at DESC);
