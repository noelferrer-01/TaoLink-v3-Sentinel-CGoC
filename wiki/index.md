# Wiki — Index

> The Sentinel project's long-term knowledge base. LLM-maintained, human-readable. Page catalog below.
> See [conventions.md](conventions.md) for how this wiki is structured and maintained.

## Project
- [project/overview.md](project/overview.md) — what Sentinel is, who it's for, where it stands
- [project/architecture.md](project/architecture.md) — Sentinel's layered architecture (reference until v3 calls land)
- [project/status.md](project/status.md) — current phase, open gates, immediate next actions

## Decisions
- [decisions/index.md](decisions/index.md) — all open and resolved architectural / scope calls
  - [0001 — Recruitment vs Operations](decisions/0001-recruitment-vs-operations-ownership.md) — **RESOLVED**
  - [0002 — Marketing department shape](decisions/0002-marketing-department-shape.md) — **RESOLVED**
  - [0003 — Relationship to CG's existing system](decisions/0003-relationship-to-existing-cg-system.md) — **RESOLVED**
  - [0004 — Applicant-pool legal classification](decisions/0004-applicant-pool-legal-classification.md) — **PARTIALLY RESOLVED**
  - [0005 — Stack: TypeScript](decisions/0005-stack.md) — **RESOLVED**
  - [0006 — Database: Postgres](decisions/0006-database.md) — **RESOLVED**
  - [0007 — Multi-tenancy: single-tenant](decisions/0007-multi-tenancy.md) — **RESOLVED**
  - [0008 — Dev environment: Docker Compose](decisions/0008-dev-environment.md) — **RESOLVED**
  - [0009 — HR-starter + Recruitment entry point](decisions/0009-hr-starter-and-recruitment-as-entry-point.md) — **RESOLVED**
  - [0010 — Inventory: event-subscribed](decisions/0010-inventory-seamlessness.md) — **RESOLVED**
  - [0011 — Operations role pivot](decisions/0011-operations-role-pivot.md) — **RESOLVED**
  - [0012 — Phase order revision](decisions/0012-phase-order-revision.md) — **SUPERSEDED-BY-0013**
  - [0013 — Vertical slices over horizontal phases](decisions/0013-vertical-slices-over-horizontal-phases.md) — **RESOLVED**
  - [0014 — Tool stack & cost discipline](decisions/0014-tool-stack-and-cost-discipline.md) — **RESOLVED**
  - [0015 — VPS deployment (deferred)](decisions/0015-vps-deployment.md) — **PARTIALLY RESOLVED**
  - [0016 — Cross-platform deployment](decisions/0016-cross-platform-deployment.md) — **RESOLVED**

## Runbooks
- [runbooks/README.md](runbooks/README.md) — convention; populated as ops procedures emerge.

## Manuals
- [manuals/README.md](manuals/README.md) — convention; end-user manuals populated as features ship.

## Log
- [log.md](log.md) — append-only chronology of what happened and when (ingests, decisions, lint passes)

## How this wiki relates to other knowledge layers
| Layer | Purpose | Owner |
|---|---|---|
| `../ref/` | Immutable reference material from v1/v2 history; not binding for v3 | Read-only |
| `../memory/` | Claude's working memory: lean index + domain notes + daily logs | Claude |
| `wiki/` (this tree) | Long-term project knowledge: manuals, runbooks, decisions, architecture | Claude + Noel, both read; Claude writes |
