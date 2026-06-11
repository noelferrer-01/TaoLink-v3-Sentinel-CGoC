-- Slice 3b — Credentials wallet (ADR 0018).
-- Adds `person_credentials`: a Person's durable licence / clearance records.
-- Hire carries verified recruitment clearances here (recruitment/service.ts),
-- and the readiness radar reads the missing/expiring required set off it.
--
-- Source of truth: modules/persons/schema.ts
-- Design: wiki/slices/3-identity-and-credentials.md §5a
-- ADR: wiki/decisions/0018-credentials-first-class.md
-- Plan: wiki/slices/3b-credentials-and-readiness-plan.md Task 1
--
-- Additive only — no destructive change (unlike 0025). `cred_type` holds the 9
-- credential-bearing recruitment doc-type spellings; it deliberately EXCLUDES
-- `resume_biodata` and `other` (documents, not credentials).

-- Enums are wrapped so a partial re-apply (migration failed AFTER the enum was
-- created but before it was recorded in _migrations) can resume cleanly —
-- Postgres has no CREATE TYPE IF NOT EXISTS, so catch duplicate_object.
DO $$ BEGIN
  CREATE TYPE "person_cred_type" AS ENUM (
    'nbi_clearance', 'police_pnp_clearance', 'barangay_clearance', 'drug_test',
    'medical_exam', 'neuro_psych', 'training_cert_sbr_rtc', 'sosia_license',
    'ltopf_license'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "person_cred_status" AS ENUM (
    'valid', 'expired', 'pending', 'revoked'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "person_credentials" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  -- The Person who holds this credential. CASCADE: a credential has no
  -- independent retention value, so removing the Person clears their wallet.
  "person_id"           uuid NOT NULL REFERENCES persons("id") ON DELETE CASCADE,

  "cred_type"           person_cred_type NOT NULL,
  "cred_number"         text,
  "issuing_body"        text,
  "issued_on"           date,
  "expires_on"          date,
  "status"              person_cred_status NOT NULL DEFAULT 'valid',

  -- Who verified it. SET NULL: the credential outlives the user account.
  "verified_by_user_id" uuid REFERENCES users("id") ON DELETE SET NULL,
  "verified_on"         date,

  "notes"               text,

  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"          timestamp with time zone DEFAULT now() NOT NULL
);

-- FK/join hot path — listCredentials(personId) and the readiness diff.
CREATE INDEX IF NOT EXISTS person_credentials_person_id_idx
  ON person_credentials (person_id);
