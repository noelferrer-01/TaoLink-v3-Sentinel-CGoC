---
name: TaoLink v3 — Sentinel Resume Point
description: Canonical handoff brief for any fresh AI session working on this project. Read this first.
type: resume-point
captured_at: 2026-05-23
captured_from_session: continuation of v1/v2 fork-collapse session 5fb36d5c
project_owner: Noel Ferrer (SistemaHub)
client: Commander Group of Companies (Philippine Security Agency)
status: pre-Phase-0 — questionnaire and stack call still gate any code
---

# v3 — Sentinel: Resume Point

> **If you are a fresh AI session and the user said "resume," read this file end-to-end before responding. Then read `/ref/sentinel-docs/` in order. Then ask the user where they want to start. Do NOT start coding. Phase 0 is gated on the client questionnaire being answered.**

> **CRITICAL — the nature of `/ref/`:**
> Everything inside `/ref/` (including this document) is **reference material only** — it captures prior thinking, prior code, prior conversations from v1/v2 and from the earlier Sentinel architecture brainstorming. **None of it is a binding decision for v3.** Treat it as input to inform v3 thinking, not as a contract v3 must follow. v3 will make its own decisions fresh, with this material as background context. When something here seems wrong or stale for v3, say so — don't follow it blindly.

---

## 0. The 60-second brief

- **Project:** TaoLink v3 (codenamed Sentinel) — a production-grade Philippine HRIS + payroll system, customized first for Commander Group of Companies (security agency, 10,000+ guards, 100+ detachments).
- **Owner:** Noel Ferrer of SistemaHub.
- **Status:** Fresh build. No code written yet. The previous attempts (v1 = PayrollCentral, v2 = TaoLink) are reference material only and live in `/ref/`.
- **Why fresh:** v1 and v2 are architecturally wrong for Sentinel AND the owner does not trust or fully understand the existing code. Salvaging would mean rewriting most of it inside an opaque codebase.
- **Hard blocker before any Phase 0 code:** the client discovery questionnaire (`/ref/sentinel-docs/sentinel-client-questionnaire.md`) must be sent to Commander Group department heads and answered. Several `[CRITICAL]` items in there determine the data model.
- **Demo concern:** v1 (PayrollCentral) is running live on `taolink.sistemahub.com` and will be demoed to Commander Group imminently. v3 work does not block or alter that demo.

---

## 1. Who the user is

- **Noel Ferrer**, Co-Founder of **SistemaHub** (working business identity for client-facing docs; signatory **Jenefer Ayson — Co-Founder**, jen@sistemahub.com).
- Self-describes as a "budding agentic engineer" — comfortable directing AI codegen, but has been burned by codebases built faster than he could read them.
- Solo or small team for the build. Solo is the working assumption.
- IDE: Google Antigravity with Claude Code plugin.
- Architectural preference (from global Soul): **modular, isolated, each feature snaps on/off cleanly, every project gets its own `.memory` file**.
- Documentation preference: version + decision documentation per module — for future knowledge base + onboarding non-technical clients.

---

## 2. The history — v1, v2, and why v3 is fresh

### v1 = PayrollCentral
- Noel's first agentic-engineer attempt at a Philippine HRIS.
- Stack: Next.js 16 (App Router, Server Actions) + TypeScript 5 + MySQL via Drizzle ORM + Lucia 3 auth + custom background worker + Nodemailer + pdfkit + Tailwind 4.
- Currently running in production on a VPS at `taolink.sistemahub.com`.
- GitHub: `noelferrer/PayrollCentral`.

### v2 = TaoLink (this `/ref/`'s source workspace)
- Was created as a **duplicate of v1** with the intention to fix v1's bugs and become "the official demo for the website (demo but a production-grade ready HRIS)."
- Diverged from v1: replaced Lucia with hand-rolled session auth, added Sentry, added 22 more migrations (0005–0026) including Pag-IBIG MFS cap restore (Circular 460), de minimis RR 29-2025, attendance selfie + GPS, backup codes, remittance filings, salary-history constraints, 13th-month disbursements.
- Added the wiki/memory/CLAUDE.md architecture pattern Noel actually likes.
- GitHub: `noelferrer-01/TAOLINK-v2`.

### The fork-collapse mistake (today, 2026-05-23)
- Discovered VPS was tracking PayrollCentral repo, not TAOLINK-v2 — disjoint git histories with three PRs (#20–22) shipped on PayrollCentral that don't exist in v2.
- Under demo pressure, collapsed to PayrollCentral as canonical and ported only the Sandigan Security demo seed across (PR #26, merged, deployed).
- **This was a mistake.** Inventorying afterward showed v2 has substantial real engineering that PayrollCentral is missing: 22 extra migrations, Sentry, hand-rolled auth, queue-depth observability endpoint, audited compliance seed with citations.

### Why v3 is a fresh start (not "extend v2")
1. **Sentinel's architecture is structurally different from v1/v2.** Sentinel locks in a 4-layer split (core → services → tools → agents), event-driven domain contracts, and a Phase-0 Auth+Audit+Approvals primitive. v1/v2 are `src/modules/<feature>/` with Server Actions reaching directly into DB. Reshaping that is rewriting every file.
2. **Sentinel's data ontology is different.** v1/v2 model employees as single-employer. Sentinel needs guards-with-client-assignments, applicant pool distinct from employee, marketing-request-id threading through every deployment event. Different shape, not different columns.
3. **Multi-tenancy is an open question** (Sentinel questionnaire A10). If Commander Group wants to license/resell, multi-tenancy goes in the foundation. v1/v2 are single-tenant.
4. **The owner does not trust v1/v2.** Direct quote: "im having a hard time on how it really works like payrun and generate payroll and stuffs. feels like it was just dumped in it." If the builder cannot reason about it, the builder cannot safely extend it, demo it, or defend it under client questioning.
5. **What v1/v2 produced is salvageable AS REFERENCE, not as code.** The compliance work (citations + rates) is a knowledge corpus — copy the documented knowledge into v3, re-implement against it with full understanding.

### What v1 and v2 become going forward
- **v1 (PayrollCentral, VPS):** stays live for the imminent Commander Group demo. No further changes after today's deploy.
- **v2 (TaoLink, this workspace):** archived. Code stays on GitHub at `noelferrer-01/TAOLINK-v2` and on disk for reference. Not the active line.
- **v3 (Sentinel, the new workspace):** the future. Starts when questionnaire + stack + Phase 0 plan are signed off.

---

## 3. Project context — Commander Group of Companies

- Philippine security agency. Website: https://commandergrp.com/Home/
- Scale: **10,000+ employees and security guards.**
- Geography: HQ in Manila, regional deployment.
- Sites: **100+ detachments**, each with different requirements (firearms, two-way radios, uniforms, training specs).
- Predecessor demo: TaoLink HRIS (v1/v2) is HR + payroll only. **Sentinel is the production-grade enterprise build for them.**
- Pre-meeting demo prep already used "Sandigan Security" as a stand-in dataset.
- Discovery already happened (`/ref/sentinel-docs/commander-group-meeting-notes.md`) — DTR per-client tracking is the primary blocker; Recruitment module is the missing piece; QR-code clock-in by detachment commander is the proposed solution for regional guards without smartphones.

See `/ref/sentinel-docs/commander-group-meeting-notes.md` for the full meeting transcript.

---

## 4. Sentinel architecture — prior thinking (reference, not binding)

These came out of a multi-thread LangGraph debate (DeepSeek vs Claude vs GPT) and a security-industry friend's workflow review during the brainstorming for Sentinel. They were called "LOCKED" in `/ref/sentinel-docs/sentinel-conversation-log.md` but **for v3 they are reference inputs, not binding decisions** — v3 may adopt, modify, or replace any of them. Confirm with Noel before treating any of this as a v3 commitment.

### 4a. Architectural principles
1. **Determinism in core, intelligence on top.** No LLM call inside payroll, DTR, tax, or firearm logs. AI lives strictly in the `agents/` layer.
2. **Agents call core. Core never calls agents.** This single rule prevents an unauditable system.
3. **Every module ships with a contract before code** — DB schema, public API, emitted events, consumed events.
4. **Configuration over code for client variation.** A client needing firearms vs. not = config flag, not code branch.
5. **Audit everything regulator-touchable.** Firearm assignments, payroll runs, DTR adjustments, salary changes — all immutable audit logs.
6. **Single source of truth per fact.** Employee status lives in HR, period. No duplication.

### 4b. Layered architecture
```
Presentation (web, mobile, chatbot UI)
    ↓
agents/   → LangGraph + LLM workflows (HR copilot, recruiter agent, etc.)
    ↓
tools/    → Versioned, agent-callable wrappers
    ↓
services/ → Business orchestration, side effects, event emission
    ↓
core/     → Pure deterministic compute, DB, no AI, no HTTP
```

### 4c. Phase order (revised — final agreed sequence)
- **Phase 0** — Auth (action-RBAC + scopes + approvals primitive) + Audit log + Event bus + repo/CI/CD/DB scaffolding
- **Phase 1** — HR (employee master, 201 file) + Marketing/Contracts + Client/Detachment master
- **Phase 2** — Deployment / Manpower Pool (split from Recruitment)
- **Phase 3** — DTR (per-client, per-assignment-window)
- **Phase 4** — Payroll
- **Phase 5** — Recruitment (hiring pipeline + applicant pool)
- **Phase 6** — Inventory (firearms, radios, uniforms, vehicles)
- **Phase 7** — Loans / Cash Advance
- **Phase 8** — Billing
- **Phase 9** — Compliance & Reporting
- **Phase 10** — AI Copilot (LangGraph)

### 4d. The applicant-pool correction (v1 architecture doc was wrong)
- "Applicant pool" = cleared, screened candidates on callback list — **NOT yet employed, NOT paid**.
- Some leave for other agencies if the wait is too long.
- Only when **deployed** do they become employees and enter payroll.
- "Bench" as a paid status was wrong in v1 — actual practice is more nuanced (relievers and floaters are paid; pure callback-list applicants are not).
- **Legal gray area** — verify with Commander Group's labor lawyer how they actually classify these people; the system models their actual practice.

### 4e. Marketing → Deployment → Recruitment workflow (prior thinking)
1. Marketing signs client and captures requirements (headcount, guard specs, firearms, radios).
2. Marketing fills a Request Form and submits to Recruitment/Deployment.
3. Marketing does NOT decide which guards go where — handoff ends there.
4. Approval gates exist between Marketing → Deployment.
5. Deployment fulfills via two paths: (a) reassign existing employees, (b) activate cleared applicants. Shortfall → open new hiring requisition.
6. Reshuffle = pulling guards between detachments. Owned by Operations/Deployment, not Marketing.
7. Agency tracks fulfillment SLA — every deployment event carries a `marketing_request_id` for end-to-end traceability.

### 4f. Identity, Access & Audit — Phase 0, not Phase 8
- **Three concepts kept separate:** Authentication (who) / Authorization (what) / Scope (which data).
- **Action-level RBAC** (50–150 permissions like `payroll.run`, `firearm.issue`, `loan.approve`) + **scope filtering at data layer** (region/detachment/client).
- **Generic `approvals` primitive** in Phase 0 — supports single-approver, multi-approver (any-of/all-of), escalation timeouts, full audit trail. Any module can use it.

### 4g. LangGraph position
- LangGraph is for **multi-step workflows that genuinely branch/loop/await-approval** (e.g., "find guards due for firearm requalification, draft renewal notices, route for approval").
- **NOT for** simple Q&A or linear pipelines — plain Anthropic SDK + tool-calling is enough for ~80% of chatbot queries.
- Phase 10. Last. Not first. Tempting to build first because flashy — depends on real data in core modules.

---

## 5. The discipline change for v3 (this is non-negotiable)

The v1/v2 codebases are opaque to their owner. That is the failure mode v3 must prevent. **Process changes:**

1. **Read-as-you-build.** Every module, every flow: I write a short narrative ("here's what happens when you click Generate Payroll, in order, by file"), Noel reads it and can explain it back, *then* we move to the next thing.
2. **README before code.** Per Noel's CLAUDE.md preference, every module ships a `README.md` with exactly four sections: Purpose / Public API / Dependencies / Known failure modes. The first commit per module is the README, not the code.
3. **One end-to-end flow per phase boundary.** Phase 0 doesn't end until Noel can click through Login → see audit log entry → trigger an approval → see it in the dashboard, and explain every step.
4. **Demo-ability is the test.** Not "tests pass." The test is: can Noel run a clean walkthrough for a hypothetical Commander Group exec without opening the code? If no, the phase isn't done.
5. **TDD where it actually matters** (payroll calc, compliance rates, DTR splits, approval routing). Tests-as-documentation: reading the test tells you what the function is supposed to do.
6. **Small, frequent walkthroughs.** Not "build a module, then explain." More like: "we just wrote the rate-resolution function — here's how it works, you trace it, then we add the next piece."
7. **Contract before code** (Sentinel principle 3). DB schema + public API + emitted events + consumed events documented before any implementation lands.
8. **No "just dump it in."** If a section of code can't be explained in two sentences, it's wrong.

This is slower per LOC, much faster per "feature Noel can actually own."

---

## 6. Open decisions — gate any v3 code start

### 6a. Stack call (OPEN)
- **Option A (lean):** TypeScript + Next.js (App Router) + Postgres + Drizzle + custom worker. Continuity with v1/v2 stack. Faster to ship. Noel already knows it. Python sidecar for LangGraph agent layer in Phase 10 only.
- **Option B:** Python + FastAPI/Flask + Postgres + Celery. Better fit for the core/services/tools/agents split and the LangGraph layer. Noel would learn it as he goes.
- **Current lean:** A (TypeScript), because the discipline-change process matters more than the language choice and continuity wins when shipping fast matters. **Final call still needed from Noel.**

### 6b. Multi-tenancy (OPEN)
- Internal build (Commander Group only) → single-tenant is fine.
- Licensable product (sell/lease to other agencies later) → multi-tenancy goes in the foundation.
- **Question is in `/ref/sentinel-docs/sentinel-client-questionnaire.md` Part A10.**

### 6c. Database choice (OPEN)
- v1/v2 used MySQL. Sentinel docs suggest Postgres.
- Postgres has better JSON, partial indexes, row-level security (useful for scope filtering), pg_cron, pg_vector. Recommended.
- **Final call still needed.**

### 6d. Hosting (OPEN)
- On-prem at Commander Group, cloud (VPS continuation, Supabase, or other), or hybrid. Some PH government contracts may require PH-only hosting.
- **Question is in questionnaire Part R.**

### 6e. The questionnaire (BLOCKING)
- `/ref/sentinel-docs/sentinel-client-questionnaire.md` has ~20 `[CRITICAL]` items that determine the data model.
- Specifically blocking before any Phase 0 code:
  - **Part A** — internal vs licensable (decides multi-tenancy)
  - **Part D8–10** — applicant-vs-employee legal moment (decides lifecycle boundary in schema)
  - **Part E7–8** — exhaustive employee statuses and which are paid (decides guard state machine)
  - **Part G1–3** — shift patterns per client (decides whether shifts are client config or global table)
  - **Part J18** — per-client equipment profiles (decides whether inventory requirements live on client or assignment)
  - **Part N** — approval thresholds (decides approvals primitive's data model)
- These must be answered by the actual department heads at Commander Group, not guessed.

---

## 7. What's in `/ref/` and how to use it

```
ref/
├── 00-RESUME-POINT.md                       ← this file. Read first.
├── README.md                                 ← short index
├── sentinel-docs/                            ← Sentinel-specific architectural input
│   ├── commander-group-meeting-notes.md      ← Commander Group discovery meeting
│   ├── sentinel-conversation-log.md          ← prior architecture decisions + open questions
│   └── sentinel-client-questionnaire.md      ← gate on Phase 0
├── compliance/                               ← THE knowledge moat from v2 (read, re-implement)
│   ├── migrations/                            ← 27 SQL files (0000–0026) + meta journal
│   ├── seed-compliance.ts                    ← rates with Circular/RR citations in comments
│   └── module/                                ← v2 src/modules/compliance/ source
│       ├── README.md
│       ├── service.ts                         ← calculation logic (study, re-implement cleanly)
│       ├── schema.ts
│       ├── actions.ts
│       ├── holiday-schema.ts
│       ├── holiday-actions.ts
│       └── index.ts
├── v2-wiki-pages/                            ← v2's wiki/pages/ — knowledge docs to consult
│   ├── payroll-engine.md
│   ├── compliance-rates.md                   ← structured citation reference
│   ├── architecture-audit.md
│   ├── feature-inventory.md
│   ├── taolink-overview.md
│   └── deployment-runbook.md
├── v2-audit-docs/                            ← v2's accumulated audit findings
│   ├── AUDIT.md
│   ├── WEBAPP-AUDIT.md
│   ├── WEBAPP-AUDIT-V2.md
│   ├── WEBAPP-AUDIT-V4.md
│   └── TAOLINK-HRIS-CLIENT-AUDIT.md
├── v2-user-docs/                             ← end-user perspective docs
│   ├── HR_MANAGER_GUIDE.md
│   └── USER_GUIDE.md
└── architecture-patterns/                    ← v2's structural patterns Noel liked
    ├── CLAUDE.md                              ← v2's project CLAUDE.md as reference
    ├── llm-wiki.md                            ← spec for the wiki/ pattern
    └── memory-system-architect.md             ← spec for the memory/ setup
```

### External pointers (not stored in `/ref/`)
- **Figma board — "Commander Group HRIS Full Suite Workflow"** (Noel's own flowchart derivation of HRIS workflows for Commander Group, based on the meeting notes and discovery): https://www.figma.com/board/4NVg61o7uorJRXtlcWDBVH/Commander-Group-HRIS-Full-Suite-Workflow?node-id=0-1
  - 258 nodes across ~30 workflow swimlanes (Recruitment, Deployment, DTR, Payroll, Inventory, Compliance, Billing, etc.)
  - When v3 design decisions touch a specific workflow, open the board and read that swimlane.
- **Commander Group website:** https://commandergrp.com/Home/
- **v1 live demo (production VPS):** https://taolink.sistemahub.com — runs the PayrollCentral codebase; do NOT touch except for the imminent demo.

### How a fresh session should use `/ref/`
- **`00-RESUME-POINT.md` (this file)** — read first. Full briefing.
- **`sentinel-docs/`** — the locked architectural decisions. Read in order: meeting notes → conversation log → questionnaire.
- **`compliance/`** — do NOT copy this code into v3. Read it as the specification of "what rates Noel already audited and cited." When you implement v3's compliance module, you re-implement against the SQL migrations and seed comments, with citations preserved, in v3's cleaner architecture.
- **`v2-wiki-pages/compliance-rates.md`** — the structured human-readable version of the compliance corpus. Often easier to start here than the SQL.
- **`v2-audit-docs/`** — what was broken in v1/v2 that you must not repeat in v3.
- **`v2-user-docs/`** — how non-technical users actually use the system. Useful for UX decisions.
- **`architecture-patterns/`** — Noel likes the wiki/memory/CLAUDE.md pattern. Adopt the pattern (cleaner version), don't copy contents.

---

## 8. When the user says "resume"

1. Read `00-RESUME-POINT.md` (this file) end-to-end.
2. Read `sentinel-docs/sentinel-conversation-log.md` — full decision history.
3. Skim `sentinel-docs/commander-group-meeting-notes.md` and `sentinel-docs/sentinel-client-questionnaire.md` for context.
4. Check the v3 workspace root (`/Users/user/Desktop/Antigravity Workflows/Taolink v3 - Sentinel/`) for any CLAUDE.md, memory/, mem0, or wiki/ Noel has set up — that's his fresh starting structure.
5. Ask Noel: **"Where do you want to start? Options:**
    - **(a) Send the client questionnaire** to Commander Group department heads so we can unblock Phase 0.
    - **(b) Stack call** — TypeScript vs Python — and lock the decision before anything else.
    - **(c) Write the v2 architecture doc** (Sentinel v2) folding in our agreed corrections from the conversation log.
    - **(d) Phase 0 implementation plan** — only if a, b, c are already done.
    - **(e) Demo runbook for v1** so the imminent Commander Group demo is safe (separate from v3 work).
    - **(f) Something else?**"
6. **Do NOT start coding before the questionnaire is answered and the stack call is made.** The whole point of v3 is to escape the "code before understanding" pattern that produced v1 and v2.

---

## 9. Things to remember about Noel's working style

- Modular, modular, modular. Each feature is a Lego brick. Modules don't interfere with each other; any module can be disabled without breaking others.
- Documentation per module — for future knowledge base + client onboarding.
- Likes the wiki/memory/CLAUDE.md pattern from v2 — adopt it in v3 (cleaner version, not the v2 contents).
- Likes seeing decisions documented as decisions happen, not in a one-time write-up at the end.
- Honest pushback is welcome. Noel asked "what if we create an HRIS from scratch?" and explicitly invited a real answer; the conversation that produced this doc only happened because the response was substantive instead of accommodating.
- Wants to actually understand what's being built. "Just dump it in" is not acceptable.
- Iteration loops (eval scripts, batch graders, prompt tuning) should default to **Sonnet or Haiku**, not Opus — token cost discipline.
- Business identity for client-facing docs: **SistemaHub** (camel-cased), signatory **Jenefer Ayson — Co-Founder**, jen@sistemahub.com, +63 968 151 0101.

---

## 10. The honest summary

- v1 was the first attempt. It works, it's on the VPS, it'll demo to Commander Group fine.
- v2 was the duplicate-and-improve attempt. It has real engineering wins (Sentry, 22 migrations, hand-rolled auth) but it carries v1's opaque-codegen DNA and Noel doesn't trust it.
- v3 is the third attempt and the one that has to land. The difference this time isn't the architecture (though that's locked tighter) — it's the **process**. Read-as-you-build. README before code. Demo-ability as the done test. No "just dump it in." Contract before implementation.
- The hardest discipline isn't writing the code. It's **stopping and explaining at every boundary so the builder owns the mental model.** That's what v1 and v2 didn't do, and that's why this resume point exists — so the next session knows exactly what process to honor.

If you understand this document, you can resume.
