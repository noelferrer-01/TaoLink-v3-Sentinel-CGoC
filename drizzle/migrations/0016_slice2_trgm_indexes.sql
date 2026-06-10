-- Slice 2 — GIN trigram indexes for fuzzy search on employee/client/detachment names.
-- Requires pg_trgm extension (enabled in 0009).

CREATE INDEX IF NOT EXISTS hr_employees_fullname_trgm
  ON hr_employees USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS hr_employees_code_trgm
  ON hr_employees USING gin (employee_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clients_name_trgm
  ON clients USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS detachments_name_trgm
  ON detachments USING gin (name gin_trgm_ops);
