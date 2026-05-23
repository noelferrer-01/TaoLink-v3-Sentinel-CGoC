# Sentinel — Architecture

> **Status: REFERENCE-ONLY.** Below is the prior architectural thinking from v1/v2/Sentinel brainstorming captured in [`../../ref/sentinel-docs/`](../../ref/sentinel-docs/). v3 may adopt, modify, or replace any of it. When v3 makes a binding call, file an ADR under [`../decisions/`](../decisions/) and update this page.

## Layered architecture (prior thinking)

```
Presentation (web, mobile, chatbot UI)
    ↓
agents/   — LangGraph + LLM workflows (HR copilot, recruiter agent)
    ↓
tools/    — Versioned, agent-callable wrappers
    ↓
services/ — Business orchestration, side effects, event emission
    ↓
core/     — Pure deterministic compute, DB; no AI, no HTTP
```

This is a *refinement* of the generic `modules/` pattern in [`../../AGENTS.md`](../../AGENTS.md). For Sentinel's domain (HRIS, payroll, compliance), the 4-layer split formalizes the boundary between "things that must be deterministic" (core) and "things that may be probabilistic" (agents).

## Architectural principles (prior thinking)

1. **Determinism in core, intelligence on top.** No LLM call inside payroll, DTR, tax, firearm logs.
2. **Agents call core. Core never calls agents.** Prevents an unauditable system.
3. **Contract before code.** Every module ships its DB schema, public API, emitted events, and consumed events before implementation.
4. **Configuration over code for client variation.** A client needing firearms vs not = config flag, not code branch.
5. **Audit everything regulator-touchable.** Firearm assignments, payroll runs, DTR adjustments, salary changes — immutable audit logs.
6. **Single source of truth per fact.** Employee status lives in HR, period. No duplication.

## Phase order (prior thinking)

| Phase | Module | Notes |
|---|---|---|
| 0 | Auth + Audit + Approvals primitive + repo/CI/CD/DB scaffolding | Foundation |
| 1 | HR + Marketing/Contracts + Client/Detachment master | |
| 2 | Deployment / Manpower Pool | Split from Recruitment — see [decision 0001](../decisions/0001-recruitment-vs-operations-ownership.md) |
| 3 | DTR | Per-client, per-assignment-window |
| 4 | Payroll | |
| 5 | Recruitment | Includes applicant pool |
| 6 | Inventory | Firearms, radios, uniforms, vehicles |
| 7 | Loans / Cash Advance | |
| 8 | Billing | |
| 9 | Compliance & Reporting | |
| 10 | AI Copilot (LangGraph) | Last. Depends on real data in core modules. |

## Identity, Access & Audit (Phase 0)

- **Three concepts kept separate:** Authentication (who) / Authorization (what) / Scope (which data).
- **Action-level RBAC** (50–150 permissions like `payroll.run`, `firearm.issue`, `loan.approve`).
- **Scope filtering at data layer** — region/detachment/client.
- **Generic `approvals` primitive** — supports single-approver, multi-approver (any-of / all-of), escalation timeouts, full audit trail. Any module uses it.

## Workflow contracts

Detailed event flows live in [`../../memory/domains/workflows.md`](../../memory/domains/workflows.md). Summary:
- **Marketing → Deployment → Recruitment** for new client demand
- **Reshuffle** for internal guard reassignment between detachments
- **Hiring → Deployment** for new hires entering active service
- **DTR → Payroll** for biometric/QR/paper attendance feeding pay runs
- **Fulfillment SLA** as a cross-cutting concern with `marketing_request_id` propagation

## Known contradictions with Commander Group practice

See [`../decisions/`](../decisions/) for the full list. Most significant:
- [0001](../decisions/0001-recruitment-vs-operations-ownership.md) — Sentinel splits Deployment from Recruitment; Commander Group fuses them under Recruitment authority.
- [0002](../decisions/0002-marketing-department-shape.md) — Sentinel assumes a Marketing department originates demand; CG meeting notes only mention "Jen" in passing.
- [0003](../decisions/0003-relationship-to-existing-cg-system.md) — Sentinel's relationship to CG's existing partial HRIS is undefined (replace? migrate from? augment?).

## Source documents

- [`../../ref/00-RESUME-POINT.md`](../../ref/00-RESUME-POINT.md) §4 — full prior architectural thinking
- [`../../ref/sentinel-docs/sentinel-conversation-log.md`](../../ref/sentinel-docs/sentinel-conversation-log.md) — decision history with reasoning
- [`../../ref/sentinel-docs/sentinel-client-questionnaire.md`](../../ref/sentinel-docs/sentinel-client-questionnaire.md) — questions whose answers harden these calls
