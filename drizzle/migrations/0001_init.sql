-- Slice 0 — initial schema
-- Tables: users, sessions, audit_log (+ immutability triggers),
--         approval_requests, approval_steps, approval_decisions,
--         event_log.
-- Postgres 16+. `gen_random_uuid()` is built-in since PG13 (no extension needed).

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

-- audit_log outlives users: when a user is deleted (legal/NPC request), audit
-- rows persist with actor_user_id SET NULL. The action history is sacred; the
-- actor reference is releasable. Pair this with the immutability triggers below.
CREATE TABLE IF NOT EXISTS audit_log (
  id             bigserial PRIMARY KEY,
  actor_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  action         text NOT NULL,
  target_kind    text,
  target_id      text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action);

-- audit_log immutability: storage-layer enforcement, not just convention.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% blocked on row %)', TG_OP, OLD.id;
END;
$$;
DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TABLE IF NOT EXISTS approval_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule         text NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

CREATE TABLE IF NOT EXISTS approval_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES users(id),
  ordinal     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_decisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_id     uuid REFERENCES approval_steps(id),
  approver_id uuid NOT NULL REFERENCES users(id),
  decision    text NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_log (
  id           bigserial PRIMARY KEY,
  topic        text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_log_topic_idx ON event_log(topic);
CREATE INDEX IF NOT EXISTS event_log_published_at_idx ON event_log(published_at);
