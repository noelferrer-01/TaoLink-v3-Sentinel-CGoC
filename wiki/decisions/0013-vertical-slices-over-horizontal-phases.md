# 0013 — Vertical slices over horizontal phases

**Status:** RESOLVED 2026-05-24 — adopt vertical slices.
**Filed:** 2026-05-24
**Touches:** Project plan, sequencing, gate definitions, demo discipline. Supersedes [0012](0012-phase-order-revision.md).

## Context

The prior Sentinel plan (in [`../../ref/00-RESUME-POINT.md`](../../ref/00-RESUME-POINT.md) §4c) was **horizontal phases** — build all of HR, then all of Deployment, then all of DTR, then all of Payroll. First payslip lands at Phase 4, i.e., months of foundation before CG sees demo-able value.

The discipline rule from `ref/00-RESUME-POINT.md` §5 says "demo-ability is the done test." Horizontal phases violate that — they ship infrastructure, not demos.

## Resolution

**Adopt vertical slices.** Each slice ships a narrow but end-to-end mini-workflow CG can demo. Approved by Noel 2026-05-24.

## The slice table

| Slice | What ships | CG can demo at end of slice |
|---|---|---|
| **0** | Auth + Audit + Approvals primitive + Event bus + DB + Docker Compose + CI/CD | (no demo — infrastructure only) |
| **1** | HR-starter + Client/Detachment master + Assignment master + manual DTR + basic Payroll + basic SSS R3 / BIR 2316 export | **"Bulk-import 10 guards, enter DTR, run payroll, export SSS R3."** End-to-end. |
| **2** | Billing + per-client rate tables | "Same payroll run also generates a client invoice." Revenue cycle complete. |
| **3** | Recruitment (ATS, blacklist, hire workflow, owns assignment writes) | "Watch a new applicant flow Applied → Hired → Deployed → first paycheck." |
| **4** | Marketing (Request Form, SLA tracking, approval gates) | "Sign Client X, Recruitment fulfills, fulfillment SLA dashboard." |
| **5** | Inventory (event-subscribed to assignments) | "Guard moves to a detachment requiring a firearm — Inventory auto-flags the mismatch." |
| **6** | Loans + SSS loan rejection | "Approve cash advance, reject SSS loan on the guard's behalf." |
| **7** | AI copilot (LangGraph + OpenRouter) — see [0014](0014-tool-stack-and-cost-discipline.md) | "Which guards are due for firearm requalification?" |

## Discipline rules baked in

1. **Never break the prior slice's demo.** Slice 3 cannot break Slice 1's payroll run. Each new slice's tests include a regression check that the prior slice's golden-path demo still works.
2. **README before code, per slice.** Each slice gets a 1-page README laid out *before* implementation: what ships, the demo script, the cross-module contracts.
3. **Slice ends when the demo passes.** Not when tests pass. Not when the code is "done." When Noel can walk a hypothetical CG exec through the demo without opening the editor.
4. **Module depth grows across slices.** Slice 1's HR has only `employees` + status. Slice 3 adds Recruitment integration to HR. Slice 6 adds loans-related fields. HR is never "done" — it grows.

## Why vertical wins for Sentinel specifically

1. **Demo-able payslip in ~2–3 months** (Slice 0 + 1) instead of 4+ months horizontal. CG sees real value early — earlier feedback loop.
2. **Each slice is debuggable end-to-end.** When something breaks, the bug is in that slice's stack of additions, not somewhere in 4 modules' worth of half-built code.
3. **Forces cross-module contracts to be designed correctly from Slice 0.** The event bus, Assignment-master schema, Approvals primitive MUST exist for Slice 1 to work. We can't punt them.
4. **CG feedback after Slice 1 catches wrong-shape rebuilds early.** If CG's actual DTR/Payroll flow doesn't match what we built, we discover that at month 3, not month 8.
5. **Maps to the read-as-you-build discipline naturally.** Each slice is a unit Noel can read, explain, and own before the next one starts.

## What we give up

- **Each module starts shallow.** Slice 1's HR has only employee master + status state machine — no leave management, no benefits, no performance reviews, no salary history. Those come back as *additions to the HR module* in later slices.
- **Risk of "breadth without depth"** if undisciplined. The rule above ("never break the prior slice's demo") is the guardrail.
- **Slightly more upfront design** on slice boundaries — but we're doing the ADR work anyway.

## Cross-references

- [0001](0001-recruitment-vs-operations-ownership.md), [0009](0009-hr-starter-and-recruitment-as-entry-point.md), [0010](0010-inventory-seamlessness.md), [0011](0011-operations-role-pivot.md) — module-shape decisions all carried forward into slice definitions.
- [0014](0014-tool-stack-and-cost-discipline.md) — tool stack supporting each slice.
- [0015](0015-vps-deployment.md) — production deployment target (deferred until CGoC provisions VPS).
- [0016](0016-cross-platform-deployment.md) — Mac + Windows + Linux deployment.
- [0012](0012-phase-order-revision.md) — superseded by this ADR.
