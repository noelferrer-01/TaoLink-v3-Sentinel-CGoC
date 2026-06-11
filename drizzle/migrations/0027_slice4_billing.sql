-- Slice 4 — Billing and SOA foundation.
-- Adds the billing module tables: client_billing_config, billing_invoices,
-- billing_invoice_lines, and billing_soa_counters (gapless SOA numbering).
--
-- Source of truth: modules/billing/schema.ts
-- Plan: wiki/slices/4-billing-and-soa-plan.md Task 3
--
-- Additive only — no destructive change. Enum wrapped so a partial re-apply
-- (migration failed AFTER the enum was created but before it was recorded in
-- _migrations) can resume cleanly — Postgres has no CREATE TYPE IF NOT EXISTS.

DO $$ BEGIN
  CREATE TYPE "billing_invoice_status" AS ENUM ('draft', 'finalized', 'paid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Per-client billing configuration: rate, payment terms, VAT/EWT flags.
-- One row per client (UNIQUE on client_id). CASCADE: config has no retention
-- value beyond the client it belongs to.
CREATE TABLE IF NOT EXISTS "client_billing_config" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id"              uuid NOT NULL REFERENCES clients("id") ON DELETE CASCADE,
  "rate_per_manday"        numeric(12, 2) NOT NULL,
  "payment_terms_days"     integer NOT NULL DEFAULT 15,
  "charges_vat"            boolean NOT NULL DEFAULT true,
  "client_withholds_ewt"   boolean NOT NULL DEFAULT true,
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "client_billing_config_client_id_unique" UNIQUE ("client_id")
);

-- Invoice header: one per client × billing period. RESTRICT on client delete
-- so we never silently orphan issued invoices.
CREATE TABLE IF NOT EXISTS "billing_invoices" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id"     uuid NOT NULL REFERENCES clients("id") ON DELETE RESTRICT,
  "period_start"  date NOT NULL,
  "period_end"    date NOT NULL,
  "soa_number"    text,
  "status"        billing_invoice_status NOT NULL DEFAULT 'draft',
  "subtotal"      numeric(12, 2) NOT NULL DEFAULT 0,
  "vat_amount"    numeric(12, 2) NOT NULL DEFAULT 0,
  "ewt_amount"    numeric(12, 2) NOT NULL DEFAULT 0,
  "total_due"     numeric(12, 2) NOT NULL DEFAULT 0,
  "generated_at"  timestamptz,
  "finalized_at"  timestamptz,
  "paid_at"       timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "billing_invoice_client_period_uq" UNIQUE ("client_id", "period_start", "period_end"),
  CONSTRAINT "billing_invoices_soa_number_unique" UNIQUE ("soa_number")
);

CREATE INDEX IF NOT EXISTS "billing_invoice_client_idx"
  ON billing_invoices ("client_id");

-- Per-employee line items within an invoice. Snapshots capture the name and
-- detachment as-of generation so reports stay accurate after reassignments.
-- CASCADE: lines have no independent retention value beyond their invoice.
CREATE TABLE IF NOT EXISTS "billing_invoice_lines" (
  "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id"                uuid NOT NULL REFERENCES billing_invoices("id") ON DELETE CASCADE,
  "employee_id"               uuid NOT NULL REFERENCES hr_employees("id") ON DELETE RESTRICT,
  "employee_code_snapshot"    text NOT NULL,
  "employee_name_snapshot"    text NOT NULL,
  "detachment_id"             uuid NOT NULL REFERENCES detachments("id") ON DELETE RESTRICT,
  "detachment_name_snapshot"  text NOT NULL,
  "days_worked"               integer NOT NULL,
  "rate_per_manday"           numeric(12, 2) NOT NULL,
  "amount"                    numeric(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS "billing_invoice_line_invoice_idx"
  ON billing_invoice_lines ("invoice_id");

-- Gapless, concurrency-safe SOA counter. One row per calendar year.
-- Callers SELECT ... FOR UPDATE on the year row before incrementing, ensuring
-- no two concurrent transactions generate the same SOA number.
CREATE TABLE IF NOT EXISTS "billing_soa_counters" (
  "year"        integer PRIMARY KEY NOT NULL,
  "next_value"  integer NOT NULL DEFAULT 1
);
