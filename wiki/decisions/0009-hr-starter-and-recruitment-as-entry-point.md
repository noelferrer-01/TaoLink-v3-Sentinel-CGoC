# 0009 — HR-starter pattern: Recruitment is the entry point, HR is the foundation

**Status:** RESOLVED (2026-05-23)
**Filed:** 2026-05-24
**Touches:** Phase order, HR module scope at Phase 1, Recruitment module scope at Phase 2, module boundaries.

## Context

Noel's question 5: "recruitment is the entry point but we need access to existing hr, so maybe an hr starter should suffice so that recruitment can have its recruited people be added on hr, right? logically speaking, this is correct, right?"

The meeting transcript confirms this from CG's side ("Sa recruitment, yun yung wala eh. Yun yung kailangan kumunik sa inyo. Yun yung kailangan pumasok sa HRIS niyo na mga bagong empleyado" — "Recruitment is what's missing. That's where we need to start. That's where new employees enter the HRIS").

There are two truths to hold simultaneously:
- **HR is the foundation** — every other module (DTR, Payroll, Inventory, Loans) references *employees*, not candidates. Without an HR module to write into, recruitment has nowhere to deliver hired guards.
- **Recruitment is the entry point** — at CG, no one enters the HRIS except through Recruitment. The first user-facing UI is the recruiter's screen, not the HR admin's.

If we read these as competing, we get the wrong design. They're not competing; they're orthogonal:
- HR owns the **data shape** (employee master, 201 file, status state machine).
- Recruitment owns the **entry workflow** (applicant pipeline, hire decision, transfer authority).

## Resolution

**Noel's framing is correct.** Build HR-starter and Recruitment-core together in early phases. Both ship in Phase 1, just split.

**HR-starter (Phase 1) scope:**
- Employee master table (the canonical record).
- 201 file basics (employee personal info, employment dates, status, key documents).
- Employee status state machine (`applicant` → `hired` → `deployed`/`reliever`/`floating`/`on-leave`/`terminated`).
- Public API: `HR.createEmployee()`, `HR.changeStatus()`, `HR.getEmployee()`.
- Emits: `HR.EmployeeCreated`, `HR.EmployeeStatusChanged`.
- NOT in scope at Phase 1: leave management, performance reviews, salary history, benefits enrollment (later phases).

**Recruitment-core (Phase 2) scope:**
- Applicant Tracking System (ATS) — tabs: Applied → Called → Documents Complied → Hired.
- Applicant database (all past applicants retained, searchable).
- Blacklist + terminated-guard auto-flag on re-apply.
- Hire decision → calls `HR.createEmployee()` to push into HR.
- Per [0001](0001-recruitment-vs-operations-ownership.md): owns assignment writes (deployment, transfer, reshuffle).
- Public API: `Recruitment.createApplicant()`, `Recruitment.hireApplicant()`, `Recruitment.assign()`, `Recruitment.transfer()`, `Recruitment.reshuffle()`.
- Emits: `Recruitment.ApplicantCreated`, `Recruitment.HireDecided`, `Recruitment.AssignmentCreated`, `Recruitment.AssignmentEnded`.

**The handoff contract:**

```
Recruitment.hireApplicant(applicantId, hireMeta)
    ↓
HR.createEmployee(fromApplicant) → returns employeeId
    ↓
Recruitment writes employeeId back to its applicant record
    ↓
Recruitment.assign(employeeId, clientId, detachmentId, startDate)
    ↓
Emits Recruitment.AssignmentCreated → DTR + Billing + Inventory subscribe
```

## Consequences

- **Phase order shifts.** Recruitment moves from Phase 5 → Phase 2 (right after HR-starter). See [0012](0012-phase-order-revision.md).
- **HR Phase 1 is intentionally minimal.** Resist the temptation to build "the full HR module" in Phase 1 — that delays Recruitment, and Recruitment is what unblocks CG.
- **Full HR features grow later** as separate phases or as additions to the HR module — leave management, salary history, benefits, performance, etc.
- **The Recruitment module is bigger than the prior Sentinel architecture assumed** — it includes assignment authority + ATS + blacklist + applicant database, not just hiring pipeline.

## Cross-references

- [0001](0001-recruitment-vs-operations-ownership.md) — Recruitment owns assignments/transfers/reshuffles.
- [0011](0011-operations-role-pivot.md) — what Operations does instead.
- [0012](0012-phase-order-revision.md) — proposed revised phase order.
- [`../../memory/domains/architecture.md`](../../memory/domains/architecture.md) — phase order is now stale; update pending.
