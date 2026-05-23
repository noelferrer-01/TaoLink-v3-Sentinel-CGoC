# Sentinel HRIS — Conversation Log & Pending Decisions

> **Purpose:** Reference document capturing all architectural conversations, decisions made, and open questions for the enterprise HRIS build.
> **Pair this with:** `SENTINEL_HRIS_ARCHITECTURE.md` (v1 design doc — now partially outdated, see Section 11 below).
> **Last updated:** From conversation series with Claude.
> **Status:** v1 architecture doc is the baseline. **A v2 revision is pending** based on workflow details surfaced in later conversations.

---

## 1. Project Context

- **Client:** Philippine security agency (name TBD).
- **Scale:** 10,000+ employees and security guards.
- **Geography:** Regional deployment, headquarters in Manila.
- **Client sites:** 100+ detachments, each with different requirements (firearms, two-way radios, uniforms, training specs).
- **Builder:** Noel (solo or small team — TBD).
- **Demo predecessor:** TaoLink HRIS (HR + payroll only). Sentinel is the production-grade enterprise build.
- **IDE:** Google Antigravity with Claude Code plugin.

---

## 2. Architectural Principles (LOCKED — do not revisit)

These came out of the LangGraph conversation thread (DeepSeek vs Claude vs GPT synthesis) and apply to all modules.

1. **Determinism in core, intelligence on top.** No LLM call is allowed inside payroll, DTR, tax, or firearm logs. AI lives strictly in the `agents/` layer.
2. **Agents call core. Core never calls agents.** This single rule prevents an unauditable system.
3. **Every module ships with a contract** before code is written: DB schema, public API, emitted events, consumed events.
4. **Configuration over code for client variation.** A client needing firearms vs. not = config flag, not code branch.
5. **Audit everything regulator-touchable.** Firearm assignments, payroll runs, DTR adjustments, salary changes — all immutable audit logs.
6. **Single source of truth per fact.** Employee status lives in HR, period. No duplication.

---

## 3. The Layered Architecture (LOCKED)

```
Presentation (web, mobile, chatbot UI)
    ↓
agents/   — LangGraph + LLM workflows (HR copilot, recruiter agent, etc.)
    ↓
tools/    — Versioned, agent-callable wrappers
    ↓
services/ — Business orchestration, side effects, event emission
    ↓
core/     — Pure deterministic compute, DB, no AI, no HTTP
```

---

## 4. LangGraph — Decision Summary

- **Layman terms:** A flowchart engine for AI agents. Lets the AI decide step-by-step what to do, call tools, branch, loop, and pause for human approval.
- **Use it for:** multi-step workflows that genuinely need branching/state (e.g., "find guards due for firearm requalification, draft renewal notices, route for approval").
- **Don't use it for:** simple Q&A or linear pipelines. Plain Anthropic SDK + tool-calling is enough for ~80% of chatbot queries.
- **Phase position:** AI copilot layer is the LAST phase, not the first. It depends on real data flowing through core modules.

---

## 5. Workflow Decisions Made (from conversation with friend in security industry)

### 5a. Marketing → Deployment → Recruitment flow

1. **Marketing** signs the client and captures requirements (headcount, guard specs, firearms, radios, etc.).
2. **Marketing fills a Request Form** and submits to Recruitment/Deployment.
3. **Marketing does NOT decide which guards go to which client.** Their job ends at handing off requirements.
4. **Approval gates exist** in the chain (specifics TBD — see open questions).
5. **Recruitment/Deployment fulfills demand** via two paths:
   - Use existing employees (relievers, floaters, guards rotating off other contracts)
   - Activate applicants from the cleared-applicant pool, or open new hiring requisitions
6. **Reshuffle** = pulling guards from one detachment to another to meet demand. Done by Operations/Deployment, not Marketing.
7. **Client doesn't care how it's fulfilled** — just wants the headcount on the deadline.
8. **Agency tracks fulfillment SLA / client satisfaction.** Required for marketing dashboards and contract renewals.

### 5b. Bench / Applicant Pool — IMPORTANT CORRECTION to v1 doc

The original v1 doc treated unallocated guards as "bench employees." Actual practice clarified by Noel's friend:

- **Many guards are NOT paid until deployed.** They wait on a callback list.
- If the wait is too long, they leave for another agency.
- This means they are **applicants, not employees** — they live in Recruitment, not HR.

**Corrected population model:**

| Population | Status | Employed? | Paid? | Module |
|---|---|---|---|---|
| Applicant Pool | Cleared, on callback list | No | No | Recruitment |
| Active Employee — Deployed | Posted at a client | Yes | Yes (billable) | HR + Deployment |
| Active Employee — Floating/Reliever | Between assignments, covers shifts | Yes | Yes (agency cost) | HR + Deployment |
| Active Employee — On Leave | VL/SL/maternity | Yes | Depends | HR |

**Honest legal flag:** "Cleared applicant pool" is a gray-area practice. DOLE has hit some agencies for non-payment of guards under contract. Verify with client's labor lawyer how they actually classify these people. The system should model whatever the agency *actually does*, accurately.

---

## 6. Module Inventory — Current Best Understanding

> Some of these are new since v1 of the architecture doc. The v1 module list is incomplete.

| Module | Phase (revised) | Status |
|---|---|---|
| Auth (RBAC, scopes, approvals, audit) | 0 | Foundation — must exist before anything else |
| Audit Log | 0 | Foundation |
| HR (employee master, 201 file) | 1 | Locked |
| Client / Detachment Master | 1 | Locked |
| **Marketing / Contracts** | 1 | **NEW — added in conversation** |
| **Deployment / Manpower Pool** | 2 | **NEW — split out from Recruitment** |
| DTR | 3 | Locked |
| Payroll | 4 | Locked |
| Recruitment (hiring pipeline + applicant pool) | 5 | Scope clarified — now includes applicant pool |
| Inventory (firearms, radios, uniforms, vehicles) | 6 | Locked |
| Loans / Cash Advance | 7 | Mentioned by Noel as a separate department |
| Billing | 8 | Locked |
| Compliance & Reporting | 9 | Locked |
| AI Copilot (LangGraph) | 10 | Last phase |

---

## 7. Identity, Access & Audit (Phase 0) — DECISION

These are foundation work, NOT a Phase 8 concern. Must be in place before any module is built.

### 7a. Three concepts to keep separate

1. **Authentication** — who are you?
2. **Authorization** — what can you do? (RBAC)
3. **Scope** — which data can you see? (region, detachment, client)

### 7b. Permission model decision

- **Action-level RBAC** (`payroll.run`, `firearm.issue`, `loan.approve`) — 50 to 150 permissions across the whole system.
- **Scope filtering at data layer** — separate from RBAC, applied by region/detachment/client.
- Pure ABAC is overkill. Action RBAC + scope filtering is the right pattern.

### 7c. Departments and roles (rough first cut — verify with client)

| Department | Example roles |
|---|---|
| Recruitment / HR Admin | Recruiter, HR Officer, HR Manager |
| Marketing / Sales | Marketing Officer, Marketing Manager |
| Deployment / Operations | Deployment Officer, Operations Manager, Area Manager |
| Payroll | Payroll Clerk, Payroll Manager |
| Loans | Loans Officer |
| Inventory | Inventory Clerk, Armorer, Supply Officer |
| Field Supervision | Detachment Supervisor |
| Compliance | Compliance Officer |
| Finance / Billing | Billing Officer, Accountant |
| Executive | CEO, COO, HR Director |
| Employee Self-Service | Guard, Office Staff |
| System | IT Admin, Super Admin |

### 7d. Approval gates — decision

Build a generic `approvals` primitive in Phase 0. Any module can use it.

| Action | Likely approver(s) |
|---|---|
| Marketing request → Deployment | Operations Manager |
| New client contract above ₱X | Executive / CEO |
| Reshuffle above N guards | Operations Manager |
| Hiring requisition | HR Manager + Operations |
| Loan above ₱X | Direct Supervisor + HR |
| Salary adjustment | HR Manager + Finance |
| Firearm issuance | Armorer + Operations Supervisor |
| Termination | HR Manager + Legal/Compliance |

The primitive must support: single-approver, multi-approver (any-of / all-of), escalation timeouts, full audit trail.

---

## 8. Integration Contracts — Event Flows

These are the handoffs between modules. Write them as a contract before coding the module.

### 8a. Marketing → Deployment → Recruitment (new contract demand)

```
Marketing.RequestFormSubmitted (need 100 guards, requirements)
    ↓ approval gate
Marketing.RequestApproved
    ↓
Deployment receives demand
    ├─ Active employees available? → use first
    │     → Deployment.AssignmentCreated
    │
    └─ Applicant pool? → call them up
          → Recruitment.CandidateActivated
          → HR.EmployeeCreated (status: training or deployed)
          → Deployment.AssignmentCreated
    ↓
Shortfall? → Recruitment.HiringRequisitionOpened
```

### 8b. Reshuffle flow

```
Operations triggers reshuffle (manual or system-suggested)
    ↓
Deployment.AssignmentEnded (Guard A leaves Detachment 1)
    ↓
Deployment.AssignmentCreated (Guard A starts at Detachment 2)
    ↓
Inventory check: does Guard A's assets match Detachment 2 needs?
    ↓ (if mismatch)
Inventory.AssetIssuanceRequired
```

### 8c. Hiring → Deployment

```
Recruitment.CandidateHired
    ↓
HR.EmployeeCreated (status: training)
    ↓
Training complete → status: bench/floating/deployable
    ↓
Deployment picks up → status: deployed at Client X
```

### 8d. DTR → Payroll

```
Biometric ingestion → DTR records
    ↓
DTR period closes → DTR.PeriodClosed event
    ↓
Payroll consumes → calculates → Payroll.RunCompleted
    ↓
Payslips generated
```

### 8e. Fulfillment SLA tracking

Every deployment event must carry a `marketing_request_id` foreign key so the chain is queryable end-to-end:
- Time to fulfill: `Marketing.RequestFormSubmitted` → all guards deployed
- Fill rate: requested vs. delivered by deadline
- Quality of fulfillment: did deployed guards meet client requirements?

---

## 9. Open Questions for Noel / Friend / Client

> Get these answered BEFORE writing v2 of the architecture doc. Otherwise the doc gets revised three times.

### 9a. Organizational

1. What does the org chart actually look like? (Departments, reporting lines.)
2. Solo build, or with a team?
3. Internal build (Noel works for the agency) or licensable product (Noel sells/leases to them)?
4. Budget and deadline communicated by client?
5. Hosting preference: on-prem, cloud, or hybrid?

### 9b. Workflow / lifecycle

6. **At what point does someone become an "employee"?** When they sign? When deployed? After training? — determines when payroll/HR is triggered.
7. **Is there a paid training period?** Affects payroll timing.
8. **What happens when a client contract ends?** Guards go to applicant pool? Stay employed as floaters? Terminated?
9. **Reliever vs. floater vs. bench — does the agency distinguish these?** Use their exact vocabulary.
10. What are the specific approval thresholds? (e.g., loan above ₱X, reshuffle above N guards)

### 9c. Existing systems

11. What systems do they currently use? (Paper, Excel, legacy software?) — defines migration scope.
12. Existing biometric devices? Brands/models? Integration capability?
13. Data migration: how many records, what shape, what format?

### 9d. Operations

14. Payroll cycle: 15th/30th? Daily/weekly for some guard categories? Cash vs. ATM disbursement?
15. Mobile app for guards? (DTR clock-in, payslip, asset acknowledgment) — large scope addition if yes.
16. Does the agency have specific KPIs they want dashboarded?

### 9e. Compliance

17. Verify with client compliance officer: PNP SOSIA, DOLE D.O. 150-2016, PNP-FEO, NTC scope and reporting frequencies.
18. Budget for one-time labor lawyer consultation before locking inventory + DTR data model?

---

## 10. Honest Risks Already Flagged

1. **Solo build at this scale is unrealistic.** 12–24 months minimum even with AI assistance. Plan accordingly or bring in help.
2. **Payroll bugs are catastrophic at 10k employees.** Plan for parallel-run periods before cutover.
3. **Biometric DTR ingestion is messier than it looks.** Idempotent ingestion + reconciliation reports from day one.
4. **Firearm tracking has legal weight.** Audit log is evidence in potential investigations. Treat as immutable.
5. **Scope creep from 100 different clients.** Config-driven approach is the defense; enforce it.
6. **Applicant-pool-without-pay is gray-area legally.** Verify with labor lawyer.
7. **Chatbot hallucinations on payroll.** Payroll explainer must quote actual numbers from the engine, never paraphrase.

---

## 11. Pending Revisions for V2 of Architecture Doc

When `SENTINEL_HRIS_ARCHITECTURE.md` is rewritten, include:

1. **New Section 4.5: Identity, Access & Audit** — RBAC, scopes, approvals, audit log as Phase 0 deliverables.
2. **Add Marketing module** to Phase 1 (alongside HR + Detachment).
3. **Add Deployment module** as separate from Recruitment, in Phase 2.
4. **Replace "bench" model with applicant-pool + active-employee-with-substatuses model.**
5. **Add Loans module** (Phase 7) — was implied but not explicit in v1.
6. **Add Fulfillment SLA tracking** as a cross-cutting concern with marketing_request_id propagation.
7. **Add the approval workflow table** to make gates explicit.
8. **Update the phase order** to: 0 (Auth/Audit) → 1 (HR + Marketing + Detachment) → 2 (Deployment) → 3 (DTR) → 4 (Payroll) → 5 (Recruitment) → 6 (Inventory) → 7 (Loans) → 8 (Billing) → 9 (Compliance) → 10 (AI Copilot).
9. **Expand folder structure** to include `core/marketing/`, `core/deployment/`, `core/loans/`, `core/auth/`, `core/audit/`.

---

## 12. Conversation Threads Summary

### Thread 1: LangGraph debate (DeepSeek vs. Claude vs. GPT)

- DeepSeek: don't use LangGraph anywhere — use Airflow/Temporal/Kafka for orchestration.
- Claude (me): DeepSeek is right about not putting LangGraph in core, but undersold the agent layer. Boring stack (Flask + Postgres + Celery) is fine for TaoLink scale.
- GPT: synthesized both, added the `services/` and `tools/` layer split — which is a real improvement and was adopted.
- Final position: deterministic core, AI on top via tools. Start chatbot with plain LLM + tool-calling, add LangGraph only when workflow genuinely needs it.

### Thread 2: Recruitment vs HR distinction

- HR = employee master (201 file). Recruitment = candidate pipeline (pre-employee).
- HR comes BEFORE Recruitment in phase order because every other module references employees, not candidates.
- Existing 10k guards onboarded via CSV/migration into HR; recruitment is for new hires going forward.

### Thread 3: Role-based access

- Department-driven: recruitment, payroll, loans, inventory, marketing, etc. all have separate teams.
- Action-RBAC + scope filtering is the right model.
- Auth, audit, and approvals are Phase 0, not Phase 8.

### Thread 4: Marketing/Deployment workflow

- Marketing originates demand via request form, doesn't pick guards.
- Deployment fulfills via active employees first, then applicant pool, then opens new hiring.
- Reshuffle = internal labor reallocation between detachments.
- SLA tracking required end-to-end.

### Thread 5: Bench guards reality check

- Bench guards in v1 doc was wrong. Many "bench" guards are actually unpaid applicants on a callback list.
- Corrected to applicant-pool + active-employee-with-substatuses model.
- Legal gray area; verify with client's labor lawyer.

---

## 13. Recommended Next Steps (in order)

1. **Get answers to Section 9 open questions.** Especially 9b (workflow/lifecycle) — wrong assumptions here mean wrong data model.
2. **Schedule client compliance officer consult** (PNP SOSIA, DOLE D.O. 150, FEO, NTC scope).
3. **Schedule labor lawyer consult** for applicant-pool legal classification.
4. **Once Section 9 answers are in, request v2 of architecture doc.**
5. **Then write Phase 0 implementation plan** using `writing-plans` skill — TDD-style, exact file paths, bite-sized tasks.
6. **Phase 0 deliverables:** repo, CI/CD, DB, Auth (RBAC + scopes + approvals), Audit log, Event bus, Celery, canary endpoint.
7. **Defer the chatbot** until Phase 10. Tempting to build first because flashy; it depends on real data in core modules.

---

## 14. Glossary

- **Sentinel** — placeholder codename for this build. Rename before locking.
- **TaoLink** — the demo/POC HRIS (HR + payroll only).
- **Detachment** — a client site where guards are deployed.
- **DTR** — Daily Time Record (Philippine HR term for attendance log).
- **Reshuffle** — internal reassignment of a guard from one detachment to another.
- **Applicant Pool** — cleared, screened candidates on callback list. NOT employees.
- **Reliever / Floater** — active employees between assignments who cover shifts.
- **Marketing Request Form** — the formal demand-origination document from Marketing to Deployment.
- **Fulfillment SLA** — time from request submission to all guards posted, plus fill rate and quality.
- **Core / Services / Tools / Agents** — the four layers of the architecture.
- **LangGraph** — flowchart engine for multi-step AI agents. Used in the AI copilot layer only.
- **PNP SOSIA / FEO / DOLE / NTC / BIR** — Philippine regulators relevant to this build.
