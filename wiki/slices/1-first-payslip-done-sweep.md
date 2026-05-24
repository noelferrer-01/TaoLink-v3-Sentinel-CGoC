# Slice 1 — Done-criteria sweep (Phase 9.4)

**Date:** 2026-05-24
**Sweep run by:** Phase 9.4 verification pass
**Result:** **12/14 pass automatically. 2 require manual sign-off before tag.**

This sweep walks every Done criterion in the [Slice 1 contract](1-first-payslip.md) and records the evidence that proves it. Where verification is mechanical, the file path + line / test name / command output is cited. Where verification is human (criterion #14, the UX bar), what's needed for sign-off is spelled out.

If any criterion below ever flips from ✓ to ✗ on `main`, Slice 1 is no longer done and must be re-opened.

---

## The 14 criteria

### 1. Admin login reaches `/dashboard` guarded by `auth.requireUser`
**Status:** ✓
**Evidence:** [`app/(admin)/layout.tsx:7-9`](../../app/%28admin%29/layout.tsx) — the admin segment layout calls `getSessionFromCookie()` and `redirect('/login')` when absent. This is the server-component equivalent of `auth.requireUser` and guards every route under `app/(admin)/*`, including [`app/(admin)/dashboard/page.tsx`](../../app/%28admin%29/dashboard/page.tsx).
**Test coverage:** `modules/auth/auth.test.ts` ✓ (login/logout/token); the layout guard itself is exercised at runtime — Phase 8.1 verified manually.

### 2. Create 1 Client + 1 Detachment via UI
**Status:** ✓
**Evidence:** UI: [`app/(admin)/clients/page.tsx`](../../app/%28admin%29/clients/page.tsx), [`app/(admin)/clients/[id]/page.tsx`](../../app/%28admin%29/clients/%5Bid%5D/page.tsx). API: `clients.createClient`, `clients.createDetachment` ([`modules/clients/index.ts`](../../modules/clients/index.ts)).
**Test coverage:** `modules/clients/clients.test.ts` — 11 tests ✓.

### 3. Bulk-import 10-row CSV with duplicate-email rejection (v2 fix M-3)
**Status:** ✓
**Evidence:** UI: [`app/(admin)/employees/import/page.tsx`](../../app/%28admin%29/employees/import/page.tsx) renders the per-row error panel. API: `hr.bulkImportEmployees` ([`modules/hr/index.ts`](../../modules/hr/index.ts)). Duplicate-email precheck at [`modules/hr/service.ts:175`](../../modules/hr/service.ts#L175) — emits `email ${r.email} already exists in HR — pick a different one or remove this row.`
**Test coverage:** `modules/hr/hr.test.ts` — 11 tests including the duplicate-email path ✓.

### 4. Assign 10 guards to detachment
**Status:** ✓
**Evidence:** UI: [`app/(admin)/assignments/page.tsx`](../../app/%28admin%29/assignments/page.tsx). API: `assignments.assign`, `assignments.endAssignment`, `assignments.getActiveAssignment` ([`modules/assignments/index.ts`](../../modules/assignments/index.ts)).
**Test coverage:** `modules/assignments/assignments.test.ts` ✓.

### 5. Enter 15-day DTR for each guard via web form
**Status:** ✓
**Evidence:** UI: [`app/(admin)/dtr/page.tsx`](../../app/%28admin%29/dtr/page.tsx) — Phase 8.5 added quick-fill + close-period. API: `dtr.recordDTR`, `dtr.getDTR`, `dtr.closePeriod` ([`modules/dtr/index.ts`](../../modules/dtr/index.ts)).
**Test coverage:** `modules/dtr/dtr.test.ts` ✓.

### 6. Close DTR period → `dtr.period.closed` event → payroll auto-runs
**Status:** ✓
**Evidence:** Subscriber: [`modules/payroll/subscriptions.ts`](../../modules/payroll/subscriptions.ts) — subscribes to `dtr.period.closed` and invokes `runPayroll`. Idempotent — `initPayrollSubscriptions()` short-circuits if already subscribed.
**Test coverage:** `modules/payroll/payroll.test.ts:411-490` — "subscriptions" describe block covers happy path, idempotent init, and event payload handling ✓.

### 7. Payslip numbers match v2 within ₱1 per line
**Status:** ✓
**Evidence:** [`modules/payroll/reconciliation.test.ts`](../../modules/payroll/reconciliation.test.ts) — V2 reconciliation gate. Three hand-computed reference cases for the 2026-05-16 → 2026-05-31 period, work-days-per-month=26, days-worked=13. Hand-computed expected values documented at [`wiki/slices/1-first-payslip-reconciliation.md`](1-first-payslip-reconciliation.md). Net-pay floor-at-zero (v2 fix C-2) implemented at [`modules/payroll/compute.ts:75`](../../modules/payroll/compute.ts#L75).
**Test coverage:** Reconciliation suite green; 4 statutory deductions (SSS_EE, PhilHealth_EE, Pag-IBIG_EE, BIR wtax) ✓.

### 8. SSS R3 export opens cleanly
**Status:** ✓
**Evidence:** UI: [`app/(admin)/exports/page.tsx`](../../app/%28admin%29/exports/page.tsx). API: `complianceExports.exportSSS_R3` ([`modules/compliance-exports/index.ts`](../../modules/compliance-exports/index.ts)). Download route: [`app/api/exports/sss-r3/[runId]/`](../../app/api/exports/sss-r3/).
**Test coverage:** `modules/compliance-exports/sss-r3.test.ts` ✓.

### 9. BIR 2316 export for one guard for current year
**Status:** ✓
**Evidence:** UI: same Exports screen. API: `complianceExports.exportBIR_2316`. Download route: [`app/api/exports/bir-2316/[employeeId]/[year]/`](../../app/api/exports/bir-2316/).
**Test coverage:** `modules/compliance-exports/bir-2316.test.ts` — 5 tests ✓.
**Caveat:** partial-year by design — module README documents this. Slice-2 task tracks full IVB fields + PDF rendering.

### 10. Slice 0 smoke tests still pass (regression gate per ADR 0013 rule #1)
**Status:** ✓
**Evidence:** [`modules/_regression/tests/slice0.test.ts`](../../modules/_regression/tests/slice0.test.ts) — Phase 9.2 added the dedicated regression suite. Imports every Slice 1 module for side effects, then re-validates auth login/logout, audit append-only (UPDATE + DELETE both rejected), events publish/subscribe, approvals request → decide round-trip and double-decide guard.
**Test coverage:** 9/9 regression tests pass; per-module Slice 0 suites also pass (auth 3 ✓, audit 3 ✓, approvals 5 ✓, events 3 ✓).

### 11. Each new module has README + smoke test
**Status:** ✓
**Evidence:**

| Module | README | Smoke test(s) |
|---|---|---|
| `hr` | [`modules/hr/README.md`](../../modules/hr/README.md) | `hr.test.ts` (11) |
| `clients` | [`modules/clients/README.md`](../../modules/clients/README.md) | `clients.test.ts` (11) |
| `assignments` | [`modules/assignments/README.md`](../../modules/assignments/README.md) | `assignments.test.ts` |
| `dtr` | [`modules/dtr/README.md`](../../modules/dtr/README.md) | `dtr.test.ts` |
| `payroll` | [`modules/payroll/README.md`](../../modules/payroll/README.md) | `payroll.test.ts`, `compute.test.ts`, `reconciliation.test.ts` |
| `compliance-exports` | [`modules/compliance-exports/README.md`](../../modules/compliance-exports/README.md) | `sss-r3.test.ts`, `bir-2316.test.ts` (5) |
| `compliance` | (rate-tables module) | `compliance.test.ts` (4) |
| `_regression` | [`modules/_regression/README.md`](../../modules/_regression/README.md) | `tests/slice0.test.ts` (9) |

### 12. CI green on `main`
**Status:** **PENDING PUSH.** ⚠
**Evidence:** Last CI run on `main` (sha `3215f7d`, 2026-05-24T03:13Z) — **success**. Local is 11 commits ahead of `origin/main` (Phase 8 + Phase 9.1 + Phase 9.2 not yet pushed). Phase 9.5 is the push + tag step and is gated on Noel's explicit OK.
**Action to flip to ✓:** complete Phase 9.5 — push these 11+ commits, wait for CI to finish on the new HEAD, confirm green.

### 13. `directives/slice-1-bootstrap.md` walks end-to-end
**Status:** ✓
**Evidence:** [`directives/slice-1-bootstrap.md`](../../directives/slice-1-bootstrap.md) — Phase 9.1 added the 9-step SOP with expected outputs at each step and the when-it-doesn't-work table.
**Caveat:** the directive is correct against the code that exists; whether it walks **without opening the editor** is a manual check — covered by criterion #14 below.

### 14. UX bar — non-technical user completes demo without coaching
**Status:** **PENDING MANUAL DEMO.** ⚠
**Evidence:** no automated coverage possible. Slice 0 + Slice 1 followed the project UX-quality-bar memory ([`project_ux_quality_bar.md`](../../../.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Taolink-v3---Sentinel/memory/project_ux_quality_bar.md)) — plain-language labels, plain-language errors, no developer jargon, visibly disabled `.btn` state (Phase 8.8 fix). The `frontend-design` skill was used for each Phase-8 screen.
**Action to flip to ✓:** Noel (or a CGoC payroll clerk) follows [`directives/slice-1-bootstrap.md`](../../directives/slice-1-bootstrap.md) end-to-end on a clean DB and reports either "passed without coaching" or "got stuck at step N because …". The latter feeds a UX-polish pass before tag.

---

## Summary

| # | Criterion | Status |
|---|---|---|
| 1 | Login → dashboard | ✓ |
| 2 | Client + detachment | ✓ |
| 3 | Bulk import + dup-email reject | ✓ |
| 4 | Assignments | ✓ |
| 5 | DTR entry | ✓ |
| 6 | Close period → auto-payroll | ✓ |
| 7 | Payslip ≤ ₱1 of v2 | ✓ (reconciliation gate) |
| 8 | SSS R3 export | ✓ |
| 9 | BIR 2316 export | ✓ |
| 10 | Slice 0 regression gate | ✓ (Phase 9.2) |
| 11 | README + smoke test per module | ✓ |
| 12 | CI green on `main` | ⚠ pending push (Phase 9.5) |
| 13 | Bootstrap directive walks end-to-end | ✓ (Phase 9.1) |
| 14 | UX bar — payroll clerk no-coaching demo | ⚠ pending manual |

**12 ✓ automatic, 2 ⚠ gated on the Phase 9.5 push + a manual demo by Noel.**

Slice 1 is *implementation-complete*. Tag `slice-1-done` should be cut only after:
1. Phase 9.5 push lands and CI goes green on the new HEAD (flips #12).
2. Noel walks the bootstrap directive end-to-end and confirms either pass or a known gap to fix first (flips #14, or routes to a polish pass).
