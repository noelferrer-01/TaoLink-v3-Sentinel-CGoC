-- Slice 3 — Recruitment ATS (the HRIS front door).
-- Applicants are a SEPARATE entity from employees (ADR 0004): no hr_employees
-- row / employee code / payroll record until hired. recruitment.hireApplicant
-- performs the ADR 0009 handoff to hr.createEmployee.
--
-- Source of truth: modules/recruitment/schema.ts
-- Reuses the existing hr_employment_type enum for position_applied_for.

CREATE TYPE recruitment_stage AS ENUM (
  'applied', 'contacted', 'documents', 'hired', 'rejected', 'withdrawn'
);

CREATE TYPE recruitment_source AS ENUM (
  'walk_in', 'referral', 'agency', 'job_board', 'social_media',
  'provincial', 'training_school', 'other'
);

CREATE TYPE recruitment_doc_type AS ENUM (
  'nbi_clearance', 'police_pnp_clearance', 'barangay_clearance', 'drug_test',
  'medical_exam', 'neuro_psych', 'training_cert_sbr_rtc', 'sosia_license',
  'ltopf_license', 'resume_biodata', 'other'
);

CREATE TYPE recruitment_doc_status AS ENUM (
  'pending', 'submitted', 'verified', 'expired'
);

CREATE TABLE IF NOT EXISTS recruitment_applicants (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "first_name" text NOT NULL,
  "middle_name" text,
  "last_name" text NOT NULL,
  "date_of_birth" date,
  "sss_number" text,
  "phone" text,
  "email" text,
  "address_line1" text,
  "address_line2" text,
  "city" text,
  "province" text,
  "source" recruitment_source DEFAULT 'walk_in' NOT NULL,
  "position_applied_for" hr_employment_type DEFAULT 'GUARD' NOT NULL,
  "is_armed_post" boolean DEFAULT false NOT NULL,
  "pipeline_stage" recruitment_stage DEFAULT 'applied' NOT NULL,
  "applied_on" date NOT NULL,
  "hired_employee_id" uuid REFERENCES hr_employees("id"),
  "outcome_reason" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS recruitment_applicant_documents (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "applicant_id" uuid NOT NULL REFERENCES recruitment_applicants("id") ON DELETE CASCADE,
  "doc_type" recruitment_doc_type NOT NULL,
  "status" recruitment_doc_status DEFAULT 'pending' NOT NULL,
  "expires_on" date,
  "verified_by_user_id" uuid REFERENCES users("id"),
  "verified_on" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS recruitment_blacklist (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "date_of_birth" date,
  "sss_number" text,
  "reason" text NOT NULL,
  "source_employee_id" uuid REFERENCES hr_employees("id"),
  "added_by_user_id" uuid REFERENCES users("id"),
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Lookup indexes for the list page + blacklist/terminated matching.
CREATE INDEX IF NOT EXISTS recruitment_applicants_stage_idx ON recruitment_applicants ("pipeline_stage");
CREATE INDEX IF NOT EXISTS recruitment_applicants_lastname_idx ON recruitment_applicants ("last_name");
CREATE INDEX IF NOT EXISTS recruitment_applicant_documents_applicant_idx ON recruitment_applicant_documents ("applicant_id");
