-- Slice 2: enable pg_trgm for fuzzy search on employee/client/detachment names.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
