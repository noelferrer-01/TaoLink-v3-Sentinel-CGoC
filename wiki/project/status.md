# Sentinel — Status

**As of 2026-05-23: Pre-Phase-0.** No code written. Workspace contains only scaffolding (`AGENTS.md`, `memory/`, `wiki/`, `ref/`, `.claude/`).

## Hard gates (must close before any Phase-0 code)

| # | Gate | Status | Resolves via |
|---|---|---|---|
| 1 | Client questionnaire answered by Commander Group department heads | OPEN | [`../../ref/sentinel-docs/sentinel-client-questionnaire.md`](../../ref/sentinel-docs/sentinel-client-questionnaire.md) (~20 [CRITICAL] items) |
| 2 | Stack call: TypeScript vs Python | OPEN (lean TS) | [Decision 0005](../decisions/0005-stack.md) |
| 3 | Database: MySQL vs Postgres | OPEN (lean Postgres) | [Decision 0006](../decisions/0006-database.md) |
| 4 | Multi-tenancy: internal vs licensable | OPEN | [Decision 0007](../decisions/0007-multi-tenancy.md) + questionnaire Part A |
| 5 | Hosting: on-prem / cloud / hybrid | OPEN | Questionnaire Part R |
| 6 | Dev environment: Docker vs native | OPEN (lean Docker Compose) | [Decision 0008](../decisions/0008-dev-environment.md) |

## Open contradictions with Commander Group practice

| # | ADR | Summary |
|---|---|---|
| 0001 | [Recruitment vs Operations ownership](../decisions/0001-recruitment-vs-operations-ownership.md) | Sentinel splits Deployment from Recruitment; CG fuses them under Recruitment. |
| 0002 | [Marketing department shape](../decisions/0002-marketing-department-shape.md) | Sentinel assumes a Marketing dept; CG mentions one person ("Jen") in passing. |
| 0003 | [Relationship to existing CG system](../decisions/0003-relationship-to-existing-cg-system.md) | Replace? Migrate from? Augment? Undefined. |
| 0004 | [Applicant-pool legal classification](../decisions/0004-applicant-pool-legal-classification.md) | Gray area. Needs labor-lawyer review with CG. |

## Immediate next-action menu (from resume point §8)

- **(a)** Send the client questionnaire to Commander Group department heads.
- **(b)** Lock the stack call ([0005](../decisions/0005-stack.md)).
- **(c)** Write the Sentinel v2 architecture doc folding in agreed corrections.
- **(d)** Phase 0 implementation plan — only after a/b/c.
- **(e)** Demo runbook for v1 (so the imminent CG demo is safe; separate from v3 work).
- **(f)** Something else.

## What's NOT in scope right now

- Writing v3 code (gated on stack call + questionnaire).
- Touching v1 (PayrollCentral) on the VPS.
- Touching v2 (TaoLink) on GitHub.
- Email system work (separate, already done by Noel).
