# 0012 — Phase order revision (proposed, post-resolutions)

**Status:** OPEN (proposed by Claude 2026-05-24; awaiting Noel's review)
**Filed:** 2026-05-24
**Touches:** Project plan, sequencing, gate definitions.

## Context

The prior Sentinel phase order (from [`../../ref/00-RESUME-POINT.md`](../../ref/00-RESUME-POINT.md) §4c) was:

| Phase | Module |
|---|---|
| 0 | Auth + Audit + Approvals + scaffolding |
| 1 | HR + Marketing/Contracts + Client/Detachment |
| 2 | Deployment / Manpower Pool |
| 3 | DTR |
| 4 | Payroll |
| 5 | Recruitment |
| 6 | Inventory |
| 7 | Loans / Cash Advance |
| 8 | Billing |
| 9 | Compliance & Reporting |
| 10 | AI Copilot |

The resolutions on [0001](0001-recruitment-vs-operations-ownership.md), [0002](0002-marketing-department-shape.md), [0009](0009-hr-starter-and-recruitment-as-entry-point.md), [0011](0011-operations-role-pivot.md) make this stale:
- Recruitment owns all assignment writes (transfers, reshuffles, deployment).
- Recruitment is the entry point — nothing else works without it.
- "Deployment" as a separate module shrinks to an assignment-storage layer owned by Recruitment.
- HR is a "starter" foundation in Phase 1, not a full module.

## Proposed revised phase order

| Phase | Module(s) | Notes |
|---|---|---|
| **0** | Auth (RBAC + scopes + approvals primitive) + Audit log + Event bus + DB scaffolding + CI/CD | Foundation. Unchanged. |
| **1** | HR-starter + Client/Detachment master + Marketing/Contracts | Core entities, all foundational. HR is minimal (employee master + 201 file + status state machine). |
| **2** | **Recruitment** (ATS + applicant pool + blacklist + hire workflow + assignment authority) | Was Phase 5. Promoted because it's the entry point AND owns the assignment table. Includes what used to be "Deployment." |
| **3** | DTR (per-client, per-assignment-window) | Subscribes to `Recruitment.AssignmentCreated/Ended`. |
| **4** | Payroll | Subscribes to `DTR.PeriodClosed`. |
| **5** | Inventory (firearms, radios, uniforms, vehicles) | Was Phase 6. Subscribes to `Recruitment.AssignmentCreated/Ended` for equipment mismatch detection. |
| **6** | Loans / Cash Advance (incl. SSS loan rejection authority) | Was Phase 7. |
| **7** | Billing | Was Phase 8. Subscribes to `DTR.PeriodClosed` + assignment data for per-client billing. |
| **8** | Compliance & Reporting | Was Phase 9. |
| **9** | AI Copilot (LangGraph) | Was Phase 10. Still last. |

## What changed and why

- **Recruitment promoted from Phase 5 → Phase 2** — it's the entry point and owns assignments. Nothing meaningful runs without it.
- **"Deployment" as separate phase dissolved** — assignment data lives inside Recruitment.
- **HR explicit as "starter" at Phase 1** — only employee master, 201, status state machine. Other HR features (leave, performance, benefits) grow in later phases as additions to the HR module, not separate phases.
- **Inventory promoted from Phase 6 → Phase 5** — closer to assignment events it depends on.
- **Total phase count drops from 11 (0–10) to 10 (0–9)** because Deployment is no longer a separate phase.

## Open questions

- Should Phase 1 (HR-starter + Marketing + Client/Detachment) be split further? Or is bundling them OK because they're all foundational entity tables that other phases reference?
- Where does **inventory at the executive system level** (firearms, vehicles owned by CG corporate, not assigned to a guard) live? Phase 5? Or a separate "Asset Master" sub-module in Phase 1?
- DTR (Phase 3) and Payroll (Phase 4) — should they be merged into a single phase since they're tightly coupled?

## Open until

Noel reviews this proposal and approves, modifies, or rejects.

## Resolution

_(Pending Noel's review.)_

## Cross-references

- [0001](0001-recruitment-vs-operations-ownership.md), [0009](0009-hr-starter-and-recruitment-as-entry-point.md), [0010](0010-inventory-seamlessness.md), [0011](0011-operations-role-pivot.md) — upstream resolutions that forced this revision.
- [`../../memory/domains/architecture.md`](../../memory/domains/architecture.md) — current copy of the *old* phase order; will update on resolution.
- [`../project/architecture.md`](../project/architecture.md) — same.
- [`../../ref/00-RESUME-POINT.md`](../../ref/00-RESUME-POINT.md) §4c — original phase order, now superseded if this proposal is adopted.
