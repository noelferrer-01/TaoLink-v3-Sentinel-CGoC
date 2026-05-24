-- Slice 2 — seed a global default payroll calendar so the Clients edit screen's
-- calendar Typeahead is never empty and so getForClient() always has a fallback.
-- The calendar is global (client_id NULL), uses CGoC's default SEMI_MONTHLY
-- cadence with 2 days cut-off + 5 days payday after period end (matches the
-- module's fallback constants).

INSERT INTO payroll_calendars (client_id, name, frequency, dtr_cutoff_days_after_period_end, payday_days_after_period_end)
SELECT NULL, 'Semi-monthly (global default)', 'SEMI_MONTHLY', 2, 5
WHERE NOT EXISTS (
  SELECT 1 FROM payroll_calendars WHERE client_id IS NULL
);
