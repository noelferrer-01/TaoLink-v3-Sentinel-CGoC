# Decisions — Index

Architectural Decision Records (ADRs) for the Sentinel project. One file per call.

## Convention

- Filename: `NNNN-kebab-case-title.md`.
- Sections: **Context**, **Options**, **Lean (if any)**, **Open until**, **Resolution** (added when closed).
- Statuses: `OPEN`, `RESOLVED`, `DEPRECATED`, `SUPERSEDED-BY-NNNN`.

## Decisions

| # | Title | Status | Resolves via |
|---|---|---|---|
| [0001](0001-recruitment-vs-operations-ownership.md) | Recruitment vs Operations: who owns guard transfers and reshuffles? | OPEN | Questionnaire + CG dept-head interviews |
| [0002](0002-marketing-department-shape.md) | Marketing department shape at Commander Group | OPEN | CG org-chart confirmation |
| [0003](0003-relationship-to-existing-cg-system.md) | Relationship between Sentinel and CG's existing partial HRIS | OPEN | CG technical / management interview |
| [0004](0004-applicant-pool-legal-classification.md) | Applicant-pool legal classification (paid vs unpaid callback list) | OPEN | Labor-lawyer consult + CG practice confirmation |
| [0005](0005-stack.md) | Stack: TypeScript vs Python | OPEN (lean TypeScript) | Noel + scope of agents/ layer |
| [0006](0006-database.md) | Database: MySQL continuation vs Postgres | OPEN (lean Postgres) | Noel after stack call |
| [0007](0007-multi-tenancy.md) | Multi-tenancy: internal-only vs licensable | OPEN | Questionnaire Part A |
| [0008](0008-dev-environment.md) | Dev environment: Docker vs native | OPEN (lean Docker Compose) | Noel after stack call |
