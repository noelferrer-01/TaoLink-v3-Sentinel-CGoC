# Decisions — Index

Architectural Decision Records (ADRs) for the Sentinel project. One file per call.

## Convention

- Filename: `NNNN-kebab-case-title.md`.
- Sections: **Context**, **Options**, **Lean (if any)**, **Open until**, **Resolution** (added when closed).
- Statuses: `OPEN`, `RESOLVED`, `PARTIALLY RESOLVED`, `SUPERSEDED-BY-NNNN`, `DEPRECATED`.

## Decisions

| # | Title | Status | Resolution summary |
|---|---|---|---|
| [0001](0001-recruitment-vs-operations-ownership.md) | Recruitment vs Operations: who owns guard transfers and reshuffles? | **RESOLVED 2026-05-23** | Recruitment owns; Operations request-only. |
| [0002](0002-marketing-department-shape.md) | Marketing department shape at Commander Group | **RESOLVED 2026-05-23** | Marketing exists (Jen). Build full Marketing module. |
| [0003](0003-relationship-to-existing-cg-system.md) | Relationship between Sentinel and CG's existing partial HRIS | **RESOLVED 2026-05-23** | No relationship. Sentinel is a parallel fresh build. |
| [0004](0004-applicant-pool-legal-classification.md) | Applicant-pool legal classification | **PARTIALLY RESOLVED 2026-05-23** | Hybrid model crossed with trust tier (refined 2026-05-24). Lawyer review still recommended. |
| [0005](0005-stack.md) | Stack: TypeScript vs Python | **RESOLVED 2026-05-24** | TypeScript + Next.js 15 + Drizzle + Postgres + hand-rolled auth. |
| [0006](0006-database.md) | Database: MySQL continuation vs Postgres | **RESOLVED 2026-05-24** | Postgres 16 (local now; on CGoC VPS when provisioned). |
| [0007](0007-multi-tenancy.md) | Multi-tenancy: internal-only vs licensable | **RESOLVED 2026-05-24** | Single-tenant. Multi-client config is normal data modeling, not tenancy. |
| [0008](0008-dev-environment.md) | Dev environment: Docker vs native | **RESOLVED 2026-05-24** | Docker Compose, same compose file local + production. |
| [0009](0009-hr-starter-and-recruitment-as-entry-point.md) | HR-starter + Recruitment-as-entry-point pattern | **RESOLVED 2026-05-23** | HR Phase-1 minimal; Recruitment Phase-2 entry point. |
| [0010](0010-inventory-seamlessness.md) | Inventory: standalone-capable but seamless via events | **RESOLVED 2026-05-23** | Event-bus subscription pattern. |
| [0011](0011-operations-role-pivot.md) | Operations role pivot after Recruitment takes transfer authority | **RESOLVED 2026-05-23** | Logistics + client liaison + monitoring + transfer requests. |
| [0012](0012-phase-order-revision.md) | Phase order revision (proposed post-resolutions) | **SUPERSEDED-BY-0013** (2026-05-24) | Horizontal-phase reshuffle replaced by vertical slices. |
| [0013](0013-vertical-slices-over-horizontal-phases.md) | Vertical slices over horizontal phases | **RESOLVED 2026-05-24** | 8 slices (0–7). Slice 1 = first demo-able payroll run. |
| [0014](0014-tool-stack-and-cost-discipline.md) | Tool stack & cost discipline (free-tier-first) | **RESOLVED 2026-05-24** | GitHub Actions / Sentry / Resend / R2 / Caddy / UptimeRobot free; OpenRouter for LLM (paid at Slice 7). |
| [0015](0015-vps-deployment.md) | VPS deployment (deferred; local-first for now) | **PARTIALLY RESOLVED 2026-05-24** | Specs locked (Hostinger KVM4); provisioning + domain deferred until CGoC is ready. |
| [0016](0016-cross-platform-deployment.md) | Cross-platform deployment (Mac + Windows + Linux) | **RESOLVED 2026-05-24** | Docker handles cross-platform. Fresh CGoC server (not their existing) if local prod replica needed. |

## All gates closed — but for these

- **Questionnaire** to CGoC department heads is still recommended (especially Parts A, D, E, G, J, N) — but with most architectural calls now locked by Noel, the questionnaire moves from "blocking" to "validation/refinement."
- **Labor-lawyer consult** for [0004](0004-applicant-pool-legal-classification.md) remains open.
- **Domain choice** (deferred per [0015](0015-vps-deployment.md)) — not blocking until production approach.
- **VPS provisioning** (deferred per [0015](0015-vps-deployment.md)) — not blocking; local-first.
