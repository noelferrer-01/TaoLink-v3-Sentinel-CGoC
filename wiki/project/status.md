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
