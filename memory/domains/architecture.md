# Architecture — Sentinel

> **Status: PARTIALLY HARDENED.** Resolutions on 2026-05-23 (see [`../../wiki/decisions/`](../../wiki/decisions/) ADRs 0001, 0002, 0003, 0004, 0009, 0010, 0011) have moved several architectural calls from reference to commitment. Remaining items below (stack, DB, multi-tenancy, exact phase order) are still REFERENCE-ONLY pending Noel's calls.
>
> **Resolved calls so far:**
> - Recruitment owns assignments + transfers + reshuffles (not Operations/Deployment).
> - Marketing is a real department; build the full Marketing module.
> - No relationship to CG's existing partial systems — Sentinel is a parallel fresh build.
> - Applicant pool is hybrid (relievers paid, new callbacks unpaid).
> - HR is "starter" (minimal) in Phase 1; Recruitment ships in Phase 2 as the entry point.
> - Inventory integrates via event bus, standalone-capable.
> - Operations role pivots to logistics/client-comms/monitoring.
>
> **Still open:** phase order revision proposal in [`../../wiki/decisions/0012-phase-order-revision.md`](../../wiki/decisions/0012-phase-order-revision.md).

## Stack (OPEN)
- **Lean A:** TypeScript + Next.js (App Router) + Postgres + Drizzle + custom worker. Continuity with v1/v2.
- **Option B:** Python + FastAPI/Flask + Postgres + Celery. Better fit for LangGraph agent layer in Phase 10.
- **Not locked.** See `../general.md` for full list of open calls.

## Sentinel layered architecture (prior thinking)
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
This is a *refinement* of the generic `modules/` pattern in `AGENTS.md` — `core/services/tools/agents` is the HRIS-domain shape of "modules."

## Architectural principles (prior thinking, called "LOCKED" in /ref/ but treat as reference)
1. **Determinism in core, intelligence on top.** No LLM call inside payroll, DTR, tax, firearm logs.
2. **Agents call core. Core never calls agents.** Prevents unauditable system.
3. **Contract before code** — DB schema, public API, emitted events, consumed events documented before implementation.
4. **Configuration over code for client variation.** A client needing firearms vs not = config flag, not code branch.
5. **Audit everything regulator-touchable.** Firearm assignments, payroll runs, DTR adjustments, salary changes — immutable audit logs.
6. **Single source of truth per fact.** Employee status lives in HR, period.

## Phase order — STALE; see proposed revision

**The phase order below is stale** because of resolutions on [0001](../../wiki/decisions/0001-recruitment-vs-operations-ownership.md) (Recruitment ownership) and [0009](../../wiki/decisions/0009-hr-starter-and-recruitment-as-entry-point.md) (HR-starter pattern). The replacement proposal is in [`../../wiki/decisions/0012-phase-order-revision.md`](../../wiki/decisions/0012-phase-order-revision.md) — Recruitment promoted to Phase 2, Deployment dissolved into Recruitment, Inventory promoted to Phase 5.

**Old order (kept for traceability):**

| Phase | Module |
|---|---|
| 0 | Auth (action-RBAC + scopes + approvals primitive) + Audit log + Event bus + repo/CI/CD/DB scaffolding |
| 1 | HR (employee master, 201 file) + Marketing/Contracts + Client/Detachment master |
| 2 | ~~Deployment / Manpower Pool~~ — dissolved into Recruitment |
| 3 | DTR (per-client, per-assignment-window) |
| 4 | Payroll |
| 5 | Recruitment — **PROMOTED to Phase 2** under the proposed revision |
| 6 | Inventory (firearms, radios, uniforms, vehicles) |
| 7 | Loans / Cash Advance |
| 8 | Billing |
| 9 | Compliance & Reporting |
| 10 | AI Copilot (LangGraph) |

## Identity, Access & Audit (Phase 0)
- Three concepts kept separate: Authentication (who) / Authorization (what) / Scope (which data).
- **Action-level RBAC** (50–150 permissions like `payroll.run`, `firearm.issue`, `loan.approve`) + **scope filtering at data layer** (region/detachment/client).
- **Generic `approvals` primitive** in Phase 0 — single-approver, multi-approver (any-of/all-of), escalation timeouts, full audit trail. Any module uses it.

## Applicant-pool correction (v1 doc was wrong)
- "Applicant pool" = cleared, screened candidates on callback list — **not employees, not paid**.
- Only when **deployed** do they become employees and enter payroll.
- v1's "bench-as-paid-status" was wrong. Relievers/floaters are paid; pure callback applicants are not.
- Legal gray area — verify with Commander Group's labor lawyer how they actually classify these people.

## Marketing → Deployment → Recruitment workflow (prior thinking)
1. Marketing signs client, captures requirements (headcount, guard specs, firearms, radios).
2. Marketing fills Request Form, submits to Recruitment/Deployment.
3. Marketing does NOT pick guards. Handoff ends there.
4. Approval gates between Marketing → Deployment.
5. Deployment fulfills via: (a) reassign existing employees, (b) activate cleared applicants. Shortfall → open hiring requisition.
6. Reshuffle = pulling guards between detachments. Owned by Operations/Deployment.
7. Every deployment event carries a `marketing_request_id` for end-to-end SLA traceability.

⚠ See open contradiction above re: who actually owns deployment authority at Commander Group.

## LangGraph
- **For:** multi-step workflows that branch/loop/await-approval (e.g., "find guards due for firearm requalification, draft renewals, route for approval").
- **NOT for:** simple Q&A or linear pipelines — plain Anthropic SDK + tool-calling is enough for ~80%.
- **Phase 10, last.** Depends on real data in core modules. Tempting to build first because flashy.

## Source documents
- `../../ref/00-RESUME-POINT.md` §4 — full architecture prior thinking
- `../../ref/sentinel-docs/sentinel-conversation-log.md` — decision history with /why/
- `../../ref/sentinel-docs/sentinel-client-questionnaire.md` — questions whose answers will harden these calls
