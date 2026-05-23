# Architecture — Sentinel

> **Status: REFERENCE-ONLY until v3 makes its own architectural calls.** Everything below is prior thinking from the v1/v2/Sentinel brainstorming captured in `../../ref/sentinel-docs/`. v3 may adopt, modify, or replace any of it. Treat as input, not commitment.

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

## Phase order (prior thinking, revised in /ref/)
| Phase | Module |
|---|---|
| 0 | Auth (action-RBAC + scopes + approvals primitive) + Audit log + Event bus + repo/CI/CD/DB scaffolding |
| 1 | HR (employee master, 201 file) + Marketing/Contracts + Client/Detachment master |
| 2 | Deployment / Manpower Pool (split from Recruitment) |
| 3 | DTR (per-client, per-assignment-window) |
| 4 | Payroll |
| 5 | Recruitment (hiring pipeline + applicant pool) |
| 6 | Inventory (firearms, radios, uniforms, vehicles) |
| 7 | Loans / Cash Advance |
| 8 | Billing |
| 9 | Compliance & Reporting |
| 10 | AI Copilot (LangGraph) |

⚠ **Open contradiction:** Phase 2 ("Deployment" as separate module) conflicts with Commander Group's actual practice where **Recruitment owns guard-transfer authority**. See `../../wiki/decisions/0001-recruitment-vs-deployment-ownership.md`.

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
