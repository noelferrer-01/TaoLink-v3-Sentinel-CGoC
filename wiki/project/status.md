# Sentinel — Status

**As of 2026-05-24 (late): Slice 0 implemented locally.** Repo scaffolded, 4 primitives shipped (auth + audit + approvals + events), typecheck / lint / 16-test suite / build all green, end-to-end login round-trip verified manually. Awaiting GitHub push to confirm CI green; then Slice 1 begins.

## Hard gates — ALL closed

| # | Gate | Status |
|---|---|---|
| 1 | Stack call: TypeScript vs Python | ✅ CLOSED — [0005](../decisions/0005-stack.md) TypeScript |
| 2 | Database: MySQL vs Postgres | ✅ CLOSED — [0006](../decisions/0006-database.md) Postgres |
| 3 | Multi-tenancy: internal vs licensable | ✅ CLOSED — [0007](../decisions/0007-multi-tenancy.md) Single-tenant |
| 4 | Hosting: on-prem / cloud / hybrid | ✅ CLOSED — [0015](../decisions/0015-vps-deployment.md) Hostinger KVM4 VPS (when CGoC provisions) |
| 5 | Dev environment: Docker vs native | ✅ CLOSED — [0008](../decisions/0008-dev-environment.md) Docker Compose |
| 6 | Delivery shape: horizontal phases vs vertical slices | ✅ CLOSED — [0013](../decisions/0013-vertical-slices-over-horizontal-phases.md) Vertical slices |
| 7 | Tool stack | ✅ CLOSED — [0014](../decisions/0014-tool-stack-and-cost-discipline.md) Free-tier-first + OpenRouter |
| 8 | Cross-platform support | ✅ CLOSED — [0016](../decisions/0016-cross-platform-deployment.md) Docker handles Mac/Windows/Linux |

## Non-blocking open items

| Item | Owner | Notes |
|---|---|---|
| Client questionnaire to CGoC department heads | Noel + CGoC | Now validation/refinement, not blocking. Still recommended for Part A (already inferred), D/E/G/J/N. |
| Labor-lawyer consult on applicant-pool classification | Noel + CGoC | Per [0004](../decisions/0004-applicant-pool-legal-classification.md). |
| Domain choice for production | Noel + CGoC | Per [0015](../decisions/0015-vps-deployment.md). Not blocking until production approach. |
| VPS provisioning | CGoC | Per [0015](../decisions/0015-vps-deployment.md). Not blocking; local-first dev. |

## Resolved contradictions (2026-05-23, all confirmed by Noel)

| # | ADR | Resolution |
|---|---|---|
| 0001 | [Recruitment vs Operations ownership](../decisions/0001-recruitment-vs-operations-ownership.md) | Recruitment owns all transfers/reshuffles. Operations request-only. |
| 0002 | [Marketing department shape](../decisions/0002-marketing-department-shape.md) | Marketing exists (Jen). Build full Marketing module. |
| 0003 | [Relationship to existing CG system](../decisions/0003-relationship-to-existing-cg-system.md) | No relationship. Parallel fresh build. |
| 0004 | [Applicant-pool legal classification](../decisions/0004-applicant-pool-legal-classification.md) | Hybrid model (relievers paid, new callbacks unpaid). Lawyer review still recommended. |
| 0009 | [HR-starter + Recruitment-as-entry-point](../decisions/0009-hr-starter-and-recruitment-as-entry-point.md) | HR-starter Phase 1 + Recruitment Phase 2; both ship early. |
| 0010 | [Inventory seamlessness](../decisions/0010-inventory-seamlessness.md) | Event-bus subscription pattern (standalone code, seamless UX). |
| 0011 | [Operations role pivot](../decisions/0011-operations-role-pivot.md) | Operations pivots to logistics + client liaison + monitoring + transfer requests. |

## Open architectural decisions

| # | ADR | Status |
|---|---|---|
| 0012 | [Phase order revision](../decisions/0012-phase-order-revision.md) | Proposed by Claude 2026-05-24; awaiting Noel's review. |

## Slice 0 — done locally (2026-05-24)

See [wiki/slices/0-foundation.md](../slices/0-foundation.md) for the contract.

- Repo: Next.js 15 + TypeScript + pnpm + Drizzle + Vitest, `core/` + `modules/` + `directives/` layout.
- Docker Compose (postgres:16-alpine + app), multi-stage Dockerfile.
- Migration `0001_init.sql` + custom runner. Tables: users, sessions, audit_log (immutable via DB triggers), approval_requests/steps/decisions, event_log.
- Modules: auth (argon2id + DB sessions), audit (append-only), approvals (single rule), events (in-process + persistent log).
- CI: `.github/workflows/ci.yml` (install / migrate / typecheck / lint / test / build).
- Verified: typecheck ✅, lint ✅, 16/16 tests ✅, build ✅, manual login round-trip ✅.

## Immediate next-action menu

- **(a)** Noel pushes local commits to `github.com/noelferrer-01/TaoLink-v3-Sentinel-CGoC` and confirms CI green.
- **(b)** Start Slice 1 — HR-starter + Client/Detachment + Assignment + manual DTR + basic Payroll + SSS R3 / BIR 2316 export.
- **(c)** Send client questionnaire to CG dept heads (validation, no longer blocking).
- **(d)** Labor-lawyer consult on ADR 0004.

## What's NOT in scope right now

- Touching v1 (PayrollCentral) on the VPS.
- Touching v2 (TaoLink) on GitHub.
- Email system work (separate, already done by Noel).
- Slice 1 features beyond what the Slice 1 contract will list.
