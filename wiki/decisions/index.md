# Decisions — Index

Architectural Decision Records (ADRs) for the Sentinel project. One file per call.

## Convention

- Filename: `NNNN-kebab-case-title.md`.
- Sections: **Context**, **Options**, **Lean (if any)**, **Open until**, **Resolution** (added when closed).
- Statuses: `OPEN`, `RESOLVED`, `PARTIALLY RESOLVED`, `DEPRECATED`, `SUPERSEDED-BY-NNNN`.

## Decisions

| # | Title | Status | Resolves via / Resolution |
|---|---|---|---|
| [0001](0001-recruitment-vs-operations-ownership.md) | Recruitment vs Operations: who owns guard transfers and reshuffles? | **RESOLVED 2026-05-23** | Recruitment owns; Operations can only request. |
| [0002](0002-marketing-department-shape.md) | Marketing department shape at Commander Group | **RESOLVED 2026-05-23** | Marketing exists (Jen). Build full Marketing module. |
| [0003](0003-relationship-to-existing-cg-system.md) | Relationship between Sentinel and CG's existing partial HRIS | **RESOLVED 2026-05-23** | No relationship. Sentinel is a parallel fresh build. |
| [0004](0004-applicant-pool-legal-classification.md) | Applicant-pool legal classification (paid vs unpaid callback list) | **PARTIALLY RESOLVED 2026-05-23** | Hybrid model: relievers/floaters paid, new callbacks unpaid. Lawyer review still recommended. |
| [0005](0005-stack.md) | Stack: TypeScript vs Python | OPEN (lean TypeScript) | Noel + scope of agents/ layer |
| [0006](0006-database.md) | Database: MySQL continuation vs Postgres | OPEN (lean Postgres) | Noel after stack call |
| [0007](0007-multi-tenancy.md) | Multi-tenancy: internal-only vs licensable | OPEN | Questionnaire Part A |
| [0008](0008-dev-environment.md) | Dev environment: Docker vs native | OPEN (lean Docker Compose) | Noel after stack call |
| [0009](0009-hr-starter-and-recruitment-as-entry-point.md) | HR-starter pattern: Recruitment is the entry point, HR is the foundation | **RESOLVED 2026-05-23** | HR-starter Phase 1 + Recruitment Phase 2; both ship early. |
| [0010](0010-inventory-seamlessness.md) | Inventory: standalone-capable but seamless via events | **RESOLVED 2026-05-23** | Event-bus subscription pattern. |
| [0011](0011-operations-role-pivot.md) | Operations role pivot after Recruitment takes transfer authority | **RESOLVED 2026-05-23** | Operations pivots to logistics + client liaison + monitoring + transfer requests. |
| [0012](0012-phase-order-revision.md) | Phase order revision (proposed post-resolutions) | **OPEN** (proposed by Claude, awaiting Noel) | See proposal in the ADR. |
