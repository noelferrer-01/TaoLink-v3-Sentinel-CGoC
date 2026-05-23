# 0006 — Database: MySQL continuation vs Postgres

**Status:** OPEN (lean Postgres)
**Filed:** 2026-05-23
**Touches:** Phase 0 schema, ORM, migrations, observability.

## Context

v1/v2 used MySQL. Sentinel `/ref/` material suggests Postgres.

## Options

### A. MySQL (continue v1/v2)

- Continuity with existing migrations and seed data in `ref/compliance/`.
- Familiar to Noel from v1/v2.

### B. Postgres

- Better JSON support, partial indexes, row-level security (useful for scope filtering at the Sentinel data layer).
- Native extensions: `pg_cron`, `pg_vector`, `pg_partman`, `pgaudit`.
- Stronger transactional guarantees relevant for payroll/compliance.

## Lean

**B (Postgres).** Row-level security alone makes scope filtering (region/detachment/client) dramatically cleaner. JSON + indexes are useful for client-config-driven module shape (Sentinel principle 4).

## Open until

Noel makes the call (typically follows the stack call — [0005](0005-stack.md)).

## Resolution

_(Pending.)_
