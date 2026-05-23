# 0006 — Database: MySQL continuation vs Postgres

**Status:** RESOLVED 2026-05-24 — **Postgres 16.** Self-hosted via Docker locally; managed Postgres free tier for hosted (Neon lean, Supabase as backup).
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

**Postgres 16, locked 2026-05-24 by Claude (per delegation framework).**

- **Version:** Postgres 16 (current stable as of build start; 17 expected mid-cycle and we'll upgrade then).
- **Local dev (current state):** containerized via Docker Compose (see [0008](0008-dev-environment.md)). This is where ALL development happens until CGoC provisions a VPS.
- **Hosted production (deferred):** Postgres on the eventual CGoC VPS (Hostinger KVM4 per [0015](0015-vps-deployment.md)), same Docker Compose pattern as local. No managed-service dependency.
- **Extensions we'll use:**
  - `pgcrypto` — UUIDs, password hashing helpers.
  - `pg_trgm` — fuzzy text search on guard/client names (recruitment lookup, blacklist match).
  - `pgaudit` — append-only audit log primitive (Phase 0).
  - `pg_partman` (later) — DTR partitioning when row counts get large.
  - `pg_cron` (later) — scheduled jobs.
  - Avoid `pg_vector` for now; defer to AI copilot slice.
- **Row-level security (RLS):** use it for scope filtering (region/detachment/client) once permissions stabilize. Don't enable in Slice 0 — adds friction during early dev.

**Why Postgres over MySQL:**
- JSON support is markedly better — useful for client-config-driven module shape (Sentinel principle 4).
- Partial indexes, RLS, and the extension ecosystem (`pgaudit`, `pg_partman`) directly serve our compliance/scale needs.
- Drizzle ORM has stronger Postgres support than MySQL.
- Industry default for new builds; easier hiring/help later if needed.

**Cost:** Local $0. Production runs on CGoC's VPS (cost is the VPS itself, which CGoC pays regardless). No additional DB-as-a-service costs.

**Operations burden:** since we self-host the DB on the VPS, we own backups, monitoring, and security patches. Runbooks to follow at [`../runbooks/`](../runbooks/) — backup rotation, point-in-time recovery, slow-query analysis. Filed as Slice 0 deliverables.
