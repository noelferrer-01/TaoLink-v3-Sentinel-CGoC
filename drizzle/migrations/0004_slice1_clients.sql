-- Slice 1 — Clients + detachments schema
-- Tables: clients, detachments.
-- Postgres 16+. Hand-written (no drizzle-kit snapshot baseline — mirrors 0003 pattern).
-- Source of truth: modules/clients/schema.ts

-- Client master table — one row per client company that CGoC guards are deployed to.
CREATE TABLE IF NOT EXISTS clients (
  id              uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  contact_email   text,
  contact_phone   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Detachment table — one row per physical post / site under a client.
CREATE TABLE IF NOT EXISTS detachments (
  id          uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid        NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name        text        NOT NULL,
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clients_name_idx        ON clients (name);
CREATE INDEX IF NOT EXISTS detachments_client_idx  ON detachments (client_id);
