# Slice 2 — UX walk findings (2026-06-08, first pass)

**Source:** Noel walked Steps 1–13 of [`directives/slice-2-bootstrap.md`](../../directives/slice-2-bootstrap.md) against the seeded DB. Walk paused at Step 12 (BIR export 500'd) — pagination + export bugs fixed, directive updated, re-walk pending.

## How to use this file during the walk

Open this file in the editor as you walk the 14 steps. For each thing that surprises you, slows you down, or feels off, paste a row into the right section:

- **Fixed during the walk (Slice 2 bugs)** — genuine Slice 2 bugs that block the demo. Fix them in-session; record what was fixed.
- **Slice-3 polish backlog** — everything else. UX gripes, missing affordances, copy nits, future feature ideas. Do NOT fix these during the walk — they're scope creep on a slice that's otherwise done.

When the walk completes:
1. Save this file.
2. Commit the Slice-2 bug fixes (if any) alongside this findings doc.
3. Confirm criteria #11 (timing ≤30 min) + #15 (no coaching needed) in [`2-multi-client-at-scale-done-sweep.md`](2-multi-client-at-scale-done-sweep.md) flip from ⚠ to ✓.
4. Cut tag `slice-2-done` and push.

---

## Walk metadata (first pass)

- **Date walked:** 2026-06-08
- **Walked by:** Noel (live, with Claude assisting on fixes)
- **Starting DB state:** post-seed (`pnpm db:seed:slice2-demo`)
- **Wall-clock for Steps 1–14:** N/A first pass (paused at Step 12). Re-walk required for criterion #11 timing.
- **Needed coaching at any step?** Yes — Steps 6, 8, 9, 12 (see below). All four causes addressed in this commit.
- **Outcome:** **Pass with fixes** (4 things addressed, 2 are real bugs + 2 are directive corrections). Re-walk pending.

---

## Fixed during the walk (Slice 2 bugs)

| # | Bug | Where | Fix |
|---|---|---|---|
| **B1** | `/assignments` page rendered all 90 rows on one page; no pagination control. Criterion #7 explicitly requires "paginated (default 50 per page)". Page called `assignments.listActiveAssignments(asOf)` which had no `limit`/`offset` and returned the full set. | [`modules/assignments/service.ts`](../../modules/assignments/service.ts), [`app/(admin)/assignments/page.tsx`](../../app/%28admin%29/assignments/page.tsx) | Extended `listActiveAssignments(asOf, {limit?, offset?})` to return `{rows, total}` with a single JOIN'd count query. Added `?page=N` searchParam to the page, default 50/page. Updated the existing 2 callers in the test suite. |
| **B2** | `/employees` page silently capped at the top 100 matches ("Showing first 100 matches") with no pagination — non-issue at 100 employees, breaks at 10k scale. | [`modules/hr/service.ts`](../../modules/hr/service.ts), [`app/(admin)/employees/page.tsx`](../../app/%28admin%29/employees/page.tsx) | Added new `hr.listEmployeesPage({query, employmentType, status, limit, offset})` returning `{rows, total}`. `searchEmployees` stays flat-array (typeahead-shaped per contract). Page reads `?page=N`, default 50/page. New test coverage added to `hr.test.ts`. |
| **B3** | BIR 2316 PDF download returned `500 Internal Server Error` with the message `Cannot convert argument to a ByteString because the character at index 100 has a value of 8212`. Root cause: the response handler set `X-BIR-2316-Warning-Messages` to a JSON string containing the em dash (`—`, U+2014) used in the warning copy. HTTP headers are Latin-1 only. | [`app/api/exports/bir-2316/[employeeId]/[year]/route.ts`](../../app/api/exports/bir-2316/%5BemployeeId%5D/%5Byear%5D/route.ts) | Removed both `X-BIR-2316-Warnings*` headers — they were dead code, no UI reads them. Warnings are surfaced separately via the readiness-preview server action that already powers the in-page warning banner ([`app/(admin)/exports/bir-picker.tsx`](../../app/%28admin%29/exports/bir-picker.tsx)). Comment in the route now explains why headers are intentionally absent. Download verified: 200 + 6436-byte `application/pdf`. |
| **B4** | Shared `Pagination` component + CSS class hooks did not exist. | [`components/pagination.tsx`](../../components/pagination.tsx), [`app/globals.css`](../../app/globals.css) | New shared component renders "Showing 1–50 of 90 · page 1 of 2" + Prev/Next links that preserve other URL params. CSS for `.pagination`, `.btn--sm`, `.btn.is-disabled`. |
| **B5** | Pagination only on /assignments + /employees; /clients, client-detail detachments, /payroll, and per-run /payroll/[runId] payslips all rendered full unbounded lists. Each will break at CGoC's real scale (~50–200 clients, 100+ detachments, ~600 pay runs over 5 years, 100–500+ payslips per run). | [`modules/clients/service.ts`](../../modules/clients/service.ts), [`modules/payroll/service.ts`](../../modules/payroll/service.ts), four list pages + [`components/pagination.tsx`](../../components/pagination.tsx) + new client island [`components/pagination-size-form.tsx`](../../components/pagination-size-form.tsx) | Added `listClientsPage`, `listDetachmentsWithDeploymentPage`, `listPayRunsPage`, `listPayslipsWithEmployeePage` — each returns `{rows, total}`. Added `getPayRunTotals` (SQL `SUM()`) so the payslips footer-totals row stays accurate when only one page of payslips is visible. Wired all four pages to the shared `Pagination` control. Added a **page-size dropdown** (25 / 50 / 100 / 200, default 50) — clamped to that allowlist server-side via `clampPageSize` so `?size=999999` cannot DoS. Used on every paginated list (employees + assignments + the four new pages). |
| **B6** | The shared `Pagination` component's first cut had `onChange="this.form.submit()"` as a JSX attribute — invalid in React (strings can't be event handlers). | [`components/pagination.tsx`](../../components/pagination.tsx), new [`components/pagination-size-form.tsx`](../../components/pagination-size-form.tsx) | Split the page-size selector into a tiny client island (`'use client'`); rest of `Pagination` stays a server component. JS payload stays small; auto-submit-on-change UX preserved. |
| **B7** | DTR was the last remaining unpaginated list — at CGoC's 10k-guard scale, the DTR grid would render 10k DOM rows per period. "Not really a list, it's a grid" was the rationale for skipping; on second look the employee axis IS a list, the day cells are just columns. | [`modules/assignments/service.ts`](../../modules/assignments/service.ts), [`app/(admin)/dtr/page.tsx`](../../app/%28admin%29/dtr/page.tsx) | Added `assignments.listOverlappingEmployeesPage(start, end, {limit, offset})` — DISTINCT ON employee dedup (transfer scenarios where a guard has two assignments in one period now collapse cleanly at the DB level instead of in TS). Returns `{rows, total}`. Plus a cheap `assignments.listOverlappingEmployeeIds(start, end)` so the **Mark all worked** action keeps its all-employees semantics — copy now reads "all 90 active employees (not just this page)". `?size` is preserved as a hidden input in the period-picker form, so picking a new period doesn't wipe the clerk's rows-per-page preference. |

---

## Directive corrections (not bugs — wording fixes)

| Step | What was wrong | Fix |
|---|---|---|
| **Step 4** | Expected "Showing first 100 matches" — copy was right at the time but is now stale since pagination shipped. | Rewritten to expect `100 employees` total + footer `Showing 1–50 of 100 · page 1 of 2` + Next-button behavior + filter math (`Type: Guard` → `80 employees`). |
| **Step 6** | Expected "pagination chip at the bottom shows `1–50 of 90`" — was a forward-looking promise before pagination shipped. | Now matches the shipped UI: explicit Prev/Next + page-2 expectation. |
| **Step 8** | Suggested picking past period `2026-05-16 → 2026-05-31` without warning that the badges would turn red. Noel hit this as "is this broken?" — it's not, it's the **late-DTR warning surface** (criterion #9). | Rewritten to distinguish current vs past period expectations, and to call out the red badges as the deliberate warning signal. |
| **Step 9** | Said "pick the first 10 employees in the list. Quick-fill each…" — but DTR has no per-row select checkboxes (entry is grid-level). | Rewritten to use the **Mark all worked** affordance that's actually shipped. Per-row select is on the Slice-3 polish backlog. |

---

## Slice-3 polish backlog (deferred)

### A. Sidebar & navigation
- _(none yet)_

### B. Tables — interactions & affordances
- **B1.** Per-row select checkboxes on the DTR grid → "fill selected rows" partial-bulk action. Useful when only some guards worked the period (the Mark-all-then-edit-exceptions pattern works but is more clicks than necessary).
- **B2.** Employees list "Bulk-assign" button currently `alert()`s `"wire in Phase 9.5"` — needs a real modal that opens against an unassigned-employees view (typeahead detachment + start date). Walk didn't hit this because the demo doesn't ask for it; would surface if a clerk tries to bulk-assign from the Employees page instead of the Assignments page. ([`app/(admin)/employees/employees-list-body.tsx:114`](../../app/%28admin%29/employees/employees-list-body.tsx#L114))
- **B3.** Employees list "Change status" button currently `alert()`s — same pattern.

### C. Search & forms
- _(none yet)_

### D. Master-data CRUD gaps
- _(none yet)_

### E. Detachment / contract modeling
- _(none yet)_

### F. Payroll calendar
- _(none yet)_

### G. Compliance / regulator integration
- _(none yet)_

### H. Government exports — at-scale workflows
- _(none yet)_

### I. Employee self-service / mobile
- _(none yet)_

### J. UI design process (meta)
- **J1.** Three of the four Step-8/9/etc. directive corrections were "directive promised behavior the UI doesn't have." Lesson: **the bootstrap directive should be written by walking the actual UI, not by walking the contract.** The Slice-1 directive was written after Phase 9 shipped; the Slice-2 directive was written from the contract walk-through. The contract describes the intended demo; the UI describes what exists. The directive should follow the UI. Apply to Slice 3.

---

## After the walk

- Update [`wiki/slices/2-multi-client-at-scale-done-sweep.md`](2-multi-client-at-scale-done-sweep.md) — flip #11 and #15 to ✓ (or note the polish pass that's needed first).
- Anything in the polish backlog above feeds either the **Slice-2 Tier-2 polish backlog** todo (small wins for the next dev cycle) or **Slice 3 planning** (real scope decisions).
