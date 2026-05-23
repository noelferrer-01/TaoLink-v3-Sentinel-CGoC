# Wiki — Index

> The Sentinel project's long-term knowledge base. LLM-maintained, human-readable. Page catalog below.
> See [conventions.md](conventions.md) for how this wiki is structured and maintained.

## Project
- [project/overview.md](project/overview.md) — what Sentinel is, who it's for, where it stands
- [project/architecture.md](project/architecture.md) — Sentinel's layered architecture (reference until v3 calls land)
- [project/status.md](project/status.md) — current phase, open gates, immediate next actions

## Decisions
- [decisions/index.md](decisions/index.md) — all open and resolved architectural / scope calls
  - [0001 — Recruitment vs Operations: who owns guard transfers and reshuffles?](decisions/0001-recruitment-vs-operations-ownership.md) — OPEN
  - [0002 — Marketing department shape at Commander Group](decisions/0002-marketing-department-shape.md) — OPEN
  - [0003 — Relationship between Sentinel and Commander Group's existing system](decisions/0003-relationship-to-existing-cg-system.md) — OPEN
  - [0004 — Applicant-pool legal classification](decisions/0004-applicant-pool-legal-classification.md) — OPEN
  - [0005 — Stack: TypeScript vs Python](decisions/0005-stack.md) — OPEN (lean TS)
  - [0006 — Database: MySQL continuation vs Postgres](decisions/0006-database.md) — OPEN (lean Postgres)
  - [0007 — Multi-tenancy: internal-only vs licensable](decisions/0007-multi-tenancy.md) — OPEN
  - [0008 — Dev environment: Docker vs native](decisions/0008-dev-environment.md) — OPEN (lean Docker Compose)

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
