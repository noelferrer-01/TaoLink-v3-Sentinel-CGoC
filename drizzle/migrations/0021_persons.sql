-- Slice 3a — Person identity spine.
-- Creates the `persons` table as the single source of truth for human identity.
-- `hr_employees` and `recruitment_applicants` will gain nullable `person_id` FKs
-- in migration 0022 (Task 3); column retirement is in 0024 (Task 12).
--
-- Source of truth: modules/persons/schema.ts
-- Design: wiki/slices/3-identity-and-credentials.md §5a
-- ADR: wiki/decisions/0017-person-centric-identity.md
--
-- GIN trigram index (persons_fullname_trgm) is hand-added here because Drizzle
-- cannot emit USING gin expression indexes. pg_trgm is already enabled (0009).

CREATE TYPE "person_sex" AS ENUM ('male', 'female');

CREATE TYPE "person_anchor_id_type" AS ENUM (
  'philsys', 'sss', 'tin', 'passport', 'umid', 'drivers_license', 'none'
);

CREATE TABLE IF NOT EXISTS "persons" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  -- Name / bio
  "first_name"              text NOT NULL,
  "last_name"               text NOT NULL,
  "middle_name"             text,
  "suffix"                  text,
  "date_of_birth"           date,
  -- sex is nullable forever — never blocks a save
  "sex"                     person_sex,

  -- Anchor IDs (unique, partial — NULLs allowed; partial unique index below)
  "philsys_number"          text,
  "sss_number"              text,
  "tin_number"              text,

  -- Member IDs (stored, non-unique)
  "philhealth_number"       text,
  "pagibig_number"          text,

  -- Secondary IDs (lookup, non-unique — reissued/recycled)
  "umid_number"             text,
  "passport_number"         text,
  "drivers_license_number"  text,

  -- Anchor marker
  "anchor_id_type"          person_anchor_id_type NOT NULL DEFAULT 'none',

  -- Address / contact (email non-unique)
  "address_line1"           text,
  "address_line2"           text,
  "city"                    text,
  "province"                text,
  "postal_code"             varchar(8),
  "phone"                   text,
  "email"                   text,

  -- Dedup / retention
  -- Self-FK expressed as plain uuid here; the FK constraint omitted intentionally
  -- because circular FKs in Postgres require deferrable constraints (unnecessary
  -- complexity for a soft dedup marker). Service layer enforces the reference.
  "suspected_duplicate_of"  uuid,
  "quarantined_ids"         text,
  "redacted_at"             timestamp with time zone,

  -- Timestamps
  "created_at"              timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"              timestamp with time zone DEFAULT now() NOT NULL
);

-- Partial unique indexes for one-per-person nationally-issued IDs.
-- WHERE IS NOT NULL means two NULL values are not considered duplicates
-- (standard SQL partial unique semantics).
CREATE UNIQUE INDEX IF NOT EXISTS persons_philsys_uq
  ON persons (philsys_number) WHERE philsys_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS persons_sss_uq
  ON persons (sss_number) WHERE sss_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS persons_tin_uq
  ON persons (tin_number) WHERE tin_number IS NOT NULL;

-- Plain lookup indexes for secondary IDs (reissued/recycled — never unique).
CREATE INDEX IF NOT EXISTS persons_umid_idx     ON persons (umid_number);
CREATE INDEX IF NOT EXISTS persons_passport_idx ON persons (passport_number);
CREATE INDEX IF NOT EXISTS persons_dl_idx       ON persons (drivers_license_number);

-- Anchor-type index for fast filtering (e.g. "list all `none` persons").
CREATE INDEX IF NOT EXISTS persons_anchor_type_idx ON persons (anchor_id_type);

-- GIN trigram index for fuzzy full-name search.
-- Drizzle cannot emit USING gin expression indexes, so this is hand-written here.
-- pg_trgm extension enabled in migration 0009.
CREATE INDEX IF NOT EXISTS persons_fullname_trgm
  ON persons USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
