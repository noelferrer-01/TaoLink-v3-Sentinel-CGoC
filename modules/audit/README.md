# modules/audit

## Purpose

Append-only audit log. Every state-changing operation in Sentinel records who did what, when, and to what. Immutability is enforced at the database layer — not just by convention.

## Public API

Import from `@/modules/audit`.

- `audit.record({ actor, action, target, payload }) → void`
  - `actor`: user id (uuid) or `null` (system / pre-auth events).
  - `action`: dotted string, e.g. `'employee.update'`, `'payroll.run'`, `'auth.login'`.
  - `target`: `{ kind, id }` — what was acted on. Optional.
  - `payload`: arbitrary JSON (diff, before/after, reason). Optional.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** none.
- **Tables:** `audit_log`.

## Immutability guarantee

A pair of `BEFORE UPDATE` and `BEFORE DELETE` triggers on `audit_log` raise an exception. Even a superuser hitting the database directly cannot UPDATE or DELETE rows. The only way to drop history is `TRUNCATE` or `DROP TABLE` — both of which should set off every alarm you have. This is intentional per [wiki/project/architecture.md](../../wiki/project/architecture.md) principle 5.

## Known failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `audit_log is append-only (UPDATE on row N)` | Some code path tried to update an audit row | Don't. Write a new row recording the correction. The original stays. |
| `actor_user_id violates foreign key constraint` | Tried to record with a non-existent user id | Pass `actor: null` for system events, or seed the user first. |
| `audit_log` growing fast in disk | Expected — it's append-only | Plan for partitioning once row count > ~50M. Not Slice 0's problem. |
