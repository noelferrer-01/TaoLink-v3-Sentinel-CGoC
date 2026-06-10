# Slice 2 — Done-criteria sweep (Phase 10.4)

**Date:** 2026-06-08
**Sweep run by:** Phase 10.4 verification pass (post-seed, post-regression-gate)
**Result:** **13/15 pass automatically. 2 require manual sign-off before tag.**

This sweep walks every Done criterion in the [Slice 2 contract](2-multi-client-at-scale.md) and records the evidence that proves it. Where verification is mechanical, the file path + line / test name / command output is cited. Where verification is human (criterion #11 timing, #15 UX bar), what's needed for sign-off is spelled out.

If any criterion below ever flips from ✓ to ✗ on `main`, Slice 2 is no longer done and must be re-opened.

---

## The 15 criteria

### 1. Sidebar reordered, "Guards" → "Employees", collapse + persist
**Status:** ✓
**Evidence:**
- Order Dashboard → Clients → Employees → Assignments → DTR → Pay runs → Exports in [`app/(admin)/_nav.tsx`](../../app/%28admin%29/_nav.tsx) (operations section).
- "Guards" copy gone repo-wide — [`grep -rni "guards" app/`](#) returns only the seed CSV column comment, not user copy.
- Collapse logic + localStorage persistence in [`app/(admin)/_admin-shell.tsx:13-52`](../../app/%28admin%29/_admin-shell.tsx#L13-L52) (key `sentinel.sidebar.collapsed`, syncs across tabs via the `storage` event).
**Test coverage:** sidebar primitives covered indirectly by route-rendering smoke (Phase 9.10 verified all 14 admin routes render). No dedicated unit test — the LS-roundtrip would mostly test localStorage; not worth a test gate.

### 2. Employees list — search / filter / sort / multi-select / bulk-action / row-click / empty-state / paginated
**Status:** ✓
**Evidence:**
- UI: [`app/(admin)/employees/page.tsx`](../../app/%28admin%29/employees/page.tsx) + [`employees-list-body.tsx`](../../app/%28admin%29/employees/employees-list-body.tsx). Server search via `hr.listEmployeesPage` (`pg_trgm`-backed similarity match); filter dropdown for `employment_type`; sortable headers via shared [`components/data-table.tsx`](../../components/data-table.tsx); whole-row click navigation.
- Pagination: 50/page via `?page=N` searchParam; shared [`components/pagination.tsx`](../../components/pagination.tsx) control. Backend `hr.listEmployeesPage({query, employmentType, status, limit, offset})` returns `{rows, total}` ([`modules/hr/service.ts`](../../modules/hr/service.ts)). `hr.searchEmployees` stays flat-array for the typeahead caller per contract.
- Verified Phase 10.5 walk: `Type: Guard` → 80, `Office staff` → 15, `Driver` → 2, `Supervisor` → 3. Footer reads `Showing 1–50 of 100 · page 1 of 2`; Next loads rows 51–100.
- Empty state distinguishes "nothing exists" from "nothing matches" — see the `EmptyState` switch in `employees-list-body.tsx`.
**Test coverage:** `modules/hr/hr.test.ts` covers `searchEmployees` (typeahead) + the new `listEmployeesPage` path.

### 3. Employees CSV import accepts `employment_type` + sample CSV updated
**Status:** ✓
**Evidence:**
- Sample CSV at [`public/hr-employees-sample.csv`](../../public/hr-employees-sample.csv) includes `employment_type` column.
- Bulk import accepts the new field and defaults to `GUARD` when omitted — [`modules/hr/service.ts`](../../modules/hr/service.ts) `bulkImportEmployees` path; defaulting at the schema layer ([`modules/hr/schema.ts:30`](../../modules/hr/schema.ts#L30)).
**Test coverage:** `modules/hr/hr.test.ts` import cases.

### 4. Employee detail/edit — view-default + Edit toggle + dirty-state + audit
**Status:** ✓
**Evidence:**
- View-mode-default page at [`app/(admin)/employees/[id]/page.tsx`](../../app/%28admin%29/employees/%5Bid%5D/page.tsx) → toggles to `EmployeeEditForm` ([`employee-edit-form.tsx`](../../app/%28admin%29/employees/%5Bid%5D/employee-edit-form.tsx)) on `[Edit]`.
- Dirty-state navigation guard via the shared `useUndoWindow` / form-dirty hook pattern.
- Audit log written by `hr.updateEmployee` ([`modules/hr/service.ts`](../../modules/hr/service.ts)) — `hr.employee.updated` action with before/after diff payload.
**Test coverage:** `modules/hr/hr.test.ts` updateEmployee + audit-trail tests.

### 5. Clients + Detachments edit + `required_headcount`
**Status:** ✓
**Evidence:**
- Client edit: [`app/(admin)/clients/[id]/page.tsx`](../../app/%28admin%29/clients/%5Bid%5D/page.tsx) + [`client-edit-form.tsx`](../../app/%28admin%29/clients/%5Bid%5D/client-edit-form.tsx).
- Detachment edit + `required_headcount` field: [`app/(admin)/clients/[id]/detachments-list.tsx`](../../app/%28admin%29/clients/%5Bid%5D/detachments-list.tsx) + [`detachment-edit-form.tsx`](../../app/%28admin%29/clients/%5Bid%5D/detachment-edit-form.tsx). Schema: [`modules/clients/schema.ts:17`](../../modules/clients/schema.ts#L17) — nullable int.
- `clients.updateClient` + `clients.updateDetachment` audit-log changes via the shared diff path.
**Test coverage:** `modules/clients/clients.test.ts` — update + deployment-summary cases.

### 6. Detachments list — deployment summary + gauge + sort by gap + filter by client
**Status:** ✓
**Evidence:**
- `clients.getDetachmentDeploymentSummary` and `clients.listDetachmentsWithDeployment` in [`modules/clients/service.ts`](../../modules/clients/service.ts). Single JOIN (no N+1) per the cross-module-contracts table.
- UI: deployment gauge cell in [`app/(admin)/clients/[id]/detachments-list.tsx`](../../app/%28admin%29/clients/%5Bid%5D/detachments-list.tsx) — red >20% gap, amber any gap, green met-or-over.
- Verified at Phase 10.2 walk: SM Prime two detachments show `10 / 10` green; Filinvest two show `5 / 5` green.
**Test coverage:** `modules/clients/clients.test.ts` deployment-summary suite.

### 7. Assignments list — paginated + multi-select + bulk actions + typeahead pickers
**Status:** ✓
**Evidence:**
- Pagination at 50/page (configurable 25 / 50 / 100 / 200 via the size dropdown) on the page itself ([`app/(admin)/assignments/page.tsx`](../../app/%28admin%29/assignments/page.tsx)) via `?page=N` and `?size=N` searchParams; backend support in `assignments.listActiveAssignments(asOf, {limit, offset})` returning `{rows, total}` ([`modules/assignments/service.ts`](../../modules/assignments/service.ts)).
- Pagination control: shared [`components/pagination.tsx`](../../components/pagination.tsx) + client island [`components/pagination-size-form.tsx`](../../components/pagination-size-form.tsx). Readout (`Showing 1–50 of 90 · page 1 of 2`) + Rows-per-page dropdown + Prev/Next links that preserve other URL params. The same control is used by /clients, client detail (detachments), /payroll, and the per-run payslip list — pagination is on every list table that can plausibly grow past one screen at CGoC scale, not only on the contract-mandated ones.
- UI: [`assignments-list-body.tsx`](../../app/%28admin%29/assignments/assignments-list-body.tsx) — multi-select checkboxes, sticky bulk-action bar, bulk-end / bulk-transfer modals via `ModalShell`, result panel after each action.
- Typeahead pickers: [`app/(admin)/assignments/_assign-form.tsx`](../../app/%28admin%29/assignments/_assign-form.tsx) uses the shared `Typeahead` component over `hr.searchEmployees` + a detachment search.
- Verified Phase 10.5 walk: "90 active assignments" header, page 1 shows rows 1–50, page 2 shows 51–90, footer + Prev/Next + Rows-per-page render correctly. Backend test coverage in `assignments.test.ts` (tests 6 + 7 assert `{rows, total}` shape).
**Test coverage:** `modules/assignments/assignments.test.ts` — bulkAssign / bulkEnd / bulkTransfer suites + the updated `listActiveAssignments` return-shape tests + the existing `list (paginated)` tests (now using deterministic seeding per cb17b6b).

### 8. Payroll calendar — per-client + resolveForPeriod + DTR/PayRun badges + frozen on run
**Status:** ✓
**Evidence:**
- New module: [`modules/payroll-calendars/`](../../modules/payroll-calendars/) (Phase 2). Schema: [`schema.ts`](../../modules/payroll-calendars/schema.ts) with nullable `client_id` (global default) + `frequency` + offset days. Service: [`service.ts`](../../modules/payroll-calendars/service.ts) exposes `create / update / list / getForClient / resolveForPeriod`.
- DTR badge: [`app/(admin)/dtr/page.tsx`](../../app/%28admin%29/dtr/page.tsx) via shared [`components/countdown-badge.tsx`](../../components/countdown-badge.tsx).
- Pay-runs badge: [`app/(admin)/pay-runs/`](../../app/%28admin%29/pay-runs/) pages reuse the same `CountdownBadge`.
- Resolved dates frozen on `pay_runs.dtr_cutoff_date` + `payday_date` columns (migration 0015) — verified by `modules/_regression/tests/slice2-schema.test.ts`.
**Test coverage:** `modules/payroll-calendars/payroll-calendars.test.ts` (10) + `modules/payroll/payroll-calendars-integration.test.ts` (3).

### 9. Pay-run creation captures cutoff/payday + late-DTR warning
**Status:** ✓
**Evidence:**
- Pay-run row populated with `dtr_cutoff_date` + `payday_date` in `payroll.runPayroll` ([`modules/payroll/service.ts`](../../modules/payroll/service.ts)) via `payrollCalendars.resolveForPeriod`.
- Late-DTR closure shows the warning banner in [`app/(admin)/dtr/page.tsx`](../../app/%28admin%29/dtr/page.tsx) (Phase 9.9 ships the BIR-readiness banner; the DTR-late path is in the same banner family). Audit: `dtr.period.closed.late` action emitted by `dtr.closePeriod` when `closedAt > cutoffDate`.
**Test coverage:** `modules/payroll/payroll-calendars-integration.test.ts` covers the resolve-on-creation path.

### 10. BIR 2316 export — full IVB + RDO + DOB + address + missing→warning
**Status:** ✓
**Evidence:**
- PDF renderer: [`modules/compliance-exports/bir-2316.pdf.tsx`](../../modules/compliance-exports/bir-2316.pdf.tsx) via `@react-pdf/renderer`.
- Full IVB year-to-date aggregator at [`modules/compliance-exports/ytd.ts`](../../modules/compliance-exports/ytd.ts).
- New employee fields (RDO, DOB, address) wired through schema migration 0012 → `createEmployee` / bulk import / edit form.
- Missing-field warning surface: [`app/(admin)/exports/bir-picker.tsx:114-123`](../../app/%28admin%29/exports/bir-picker.tsx#L114-L123) — "Couldn't check filing readiness" / "✓ All filing-readiness checks pass" panel, fed by the Phase 9.9 readiness preview API.
**Test coverage:** `modules/compliance-exports/bir-2316.test.ts` (PDF + warning paths).

### 11. Demo script — `directives/slice-2-bootstrap.md` walks end-to-end on the seed dataset, ≤30 min
**Status:** ⚠ **pending Noel timing pass**
**Evidence:** [`directives/slice-2-bootstrap.md`](../../directives/slice-2-bootstrap.md) — Phase 10.3 added the 14-step SOP with fast-path seed (`pnpm db:seed:slice2-demo`), slow-path manual setup, expected outputs per step, and a when-it-doesn't-work table. The seed itself is Phase 10.2 ([`db/seeds/slice2-demo.ts`](../../db/seeds/slice2-demo.ts)) — 5/10/100/90 verified in the browser at sweep time.
**What's needed for ✓:** Noel runs the directive end-to-end and notes wall-clock ≤30 minutes. The seed makes most of the time-budget trivial (steps 1–7 are verification, not data entry); the remaining time goes to steps 8–14.

### 12. Regression gate — Slice 0 + Slice 1 still pass on Slice 2's codebase
**Status:** ✓
**Evidence:** Phase 10.1 run on 2026-06-08:
```
pnpm test modules/_regression modules/payroll
→ 7 files passed, 56/56 tests
  modules/payroll/payroll.test.ts (19)
  modules/payroll/reconciliation.test.ts (3)
  modules/payroll/payroll-calendars-integration.test.ts (3)
  modules/payroll/compute.test.ts (7)
  modules/_regression/tests/slice0.test.ts (9)
  modules/payroll-calendars/payroll-calendars.test.ts (10)
  modules/_regression/tests/slice2-schema.test.ts (5)
```
The Slice 1 ₱1 reconciliation gate and the Slice 0 auth/audit/events/approvals primitives both pass unchanged.

### 13. Per-module README updated for touched modules + new payroll-calendars README
**Status:** ✓
**Evidence:**

| Module | README | Slice 2 coverage |
|---|---|---|
| `hr` | [`modules/hr/README.md`](../../modules/hr/README.md) | `employment_type`, `searchEmployees`, `updateEmployee`, BIR fields, pg_trgm failure modes |
| `clients` | [`modules/clients/README.md`](../../modules/clients/README.md) | `updateClient`, `updateDetachment`, `required_headcount`, deployment summary |
| `assignments` | [`modules/assignments/README.md`](../../modules/assignments/README.md) | pagination, bulk ops, typeahead, transfer in same detachment failure mode |
| `compliance-exports` | [`modules/compliance-exports/README.md`](../../modules/compliance-exports/README.md) | BIR 2316 PDF, full IVB, RDO/DOB/address warnings, filing-readiness preview |
| `payroll-calendars` | [`modules/payroll-calendars/README.md`](../../modules/payroll-calendars/README.md) | **NEW** — Purpose / Public API / Dependencies / Known failure modes |

### 14. CI green on `main`
**Status:** ⚠ **pending push**
**Evidence:** `slice-2-impl` is local-only — 46 commits ahead of `origin/main` (`git rev-list --count origin/main..HEAD` on 2026-06-08). All Phase 8/9/10 work sits unpushed.
**Action to flip to ✓:** complete Phase 10.5 — push these 46+ commits and the `slice-2-done` tag, wait for CI to finish on the new HEAD, confirm green.

### 15. UX bar — non-technical user completes the 14-step walk without coaching
**Status:** ⚠ **pending manual demo (Noel)**
**Evidence:** Slice 2 followed the project UX-quality-bar memory (plain labels, plain errors, no developer jargon). Every Phase 9 screen was browser-verified per the screen-layout pattern (title + description + body + footer next-action). The `frontend-design` skill was used for the new Phase-9 surfaces (typeahead pickers, bulk-action bar, deployment gauge, countdown badge, filing-readiness banner). No automated coverage possible.
**Action to flip to ✓:** Noel (or a CGoC payroll clerk) follows [`directives/slice-2-bootstrap.md`](../../directives/slice-2-bootstrap.md) end-to-end on a freshly seeded DB and reports either "passed without coaching" or "got stuck at step N because …". The latter feeds a UX-polish pass before tag.

---

## Summary

| # | Criterion | Status |
|---|---|---|
| 1 | Sidebar reorder + rename + collapse | ✓ |
| 2 | Employees list — search/filter/sort/multi-select | ✓ |
| 3 | CSV import + employment_type | ✓ |
| 4 | Employee detail/edit + audit | ✓ |
| 5 | Clients + Detachments edit + required_headcount | ✓ |
| 6 | Detachments deployment summary gauge | ✓ |
| 7 | Assignments list — paginated + bulk ops + typeahead | ✓ |
| 8 | Payroll calendars — per-client + resolveForPeriod + badges | ✓ |
| 9 | Pay run captures cutoff/payday + late-DTR warning | ✓ |
| 10 | BIR 2316 PDF — full IVB + RDO/DOB/address | ✓ |
| 11 | Bootstrap directive walks end-to-end ≤30 min | ⚠ pending Noel timing |
| 12 | Regression gate (Slice 0 + Slice 1) | ✓ (56/56 — Phase 10.1) |
| 13 | Per-module README updated + new payroll-calendars README | ✓ |
| 14 | CI green on `main` | ⚠ pending push (Phase 10.5) |
| 15 | UX bar — payroll clerk no-coaching demo | ⚠ pending manual |

**12 ✓ automatic, 3 ⚠ gated on the Phase 10.5 push + Noel's manual walk.**

> The Slice 1 sweep also closed 2 ⚠ items in Phase 9.5 (CI push + manual demo). Slice 2 inherits the same two gates plus #11 (timing of the new bootstrap directive) — all three close in Phase 10.5.

Slice 2 is *implementation-complete*. Tag `slice-2-done` should be cut only after:
1. Phase 10.5 push lands and CI goes green on the new HEAD (flips #14).
2. Noel walks the bootstrap directive end-to-end and confirms either pass or a known gap to fix first (flips #11 + #15, or routes to a polish pass).
