-- Slice 2 — Add detachments.required_headcount (nullable until contract is signed).
-- Surfaces in deployment-gap UI (Phase 9). Marketing writes this in Slice 3.

ALTER TABLE detachments
  ADD COLUMN IF NOT EXISTS required_headcount integer;
