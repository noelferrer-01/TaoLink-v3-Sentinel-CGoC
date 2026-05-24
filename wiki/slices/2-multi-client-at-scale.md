# Slice 2 — Multi-Client Operations at CGoC Scale

**Status:** CONTRACT DRAFT (2026-05-24). Implementation pending.
**Ships:** Sidebar rebuild + Guards→Employees + multi-select + typeahead/search + edit on masters + required_headcount + payroll calendar (cut-off/payday) + BIR 2316 completion
**Demo at end:** *Onboard 100 employees (mix of guards + office staff) across 5 clients with 10 detachments. Multi-select 50 employees and assign them in one click. Set per-client payroll calendars. Run payroll respecting cut-off / payday dates. Export a complete BIR 2316 (not a placeholder).*

This is the contract for Slice 2. Per [ADR 0013](../decisions/0013-vertical-slices-over-horizontal-phases.md) discipline rule #2, this README ships **before** the code does. If a thing is not listed here, it is not in Slice 2.

**Discipline change for Slice 2 onwards:** Wireframes + UX walk-through sections precede the Components/schema sections. UI design happens at contract-drafting time, not implementation phase. The wireframe drives the schema, not the other way around. (Established 2026-05-24 after Slice 1's UX walk surfaced ~15 polish items that contract-stage wireframing would have caught — see [`1-first-payslip-ux-walk-findings.md`](1-first-payslip-ux-walk-findings.md) §J1.)

---

## What Slice 2 buys us

Slice 1 proved the math: one detachment, ten guards, fifteen days, four deductions, payslips that reconcile within ₱1 of v2's audited engine. Demo-able to one CGoC payroll clerk who knows what to click.

Slice 2 buys us **scale + clerk usability**. End of slice, the same demo runs against 100 employees / 5 clients / 10 detachments without the clerk drowning in single-row clicks, scrolling for headcount status, or guessing which "Guard" really means an office staff member. CGoC's actual production scale is 10,000+ guards across 100+ detachments — Slice 2 doesn't get us to that number, but it gets us to a UI that *doesn't fall apart* on the way there. Tables are searchable, sortable, multi-selectable. Master records are editable, not just creatable. Detachments know how many bodies they're contracted for. Payroll knows when DTR is due and when bank disbursement hits.

The slice also closes one Slice-1 loose end that matters for credibility: BIR 2316 currently exports a partial form. Slice 2 ships a complete 2316 (IVB fields + RDO + DOB + address) so the CGoC compliance clerk can hand the file to BIR without manual fill-in.

Slice 2 explicitly *does not* introduce new payroll math, new compliance exports beyond 2316 completion, new roles, or the rate-stack engine. Those are later slices. The bar for Slice 2 is: *same correctness as Slice 1, ten times the scale, with UI that doesn't make the clerk cry.*

---

## Wireframes

Wireframes for the 5 most-impactful screens. Other touched screens are bullet-described under [§Other affected screens](#other-affected-screens).

> **Convention:** ASCII boxes are layout only. Annotations in `[brackets]` describe interactive behavior. `~~strikethrough~~` denotes elements removed from Slice 1's version. **Bold** denotes new in Slice 2.

### W1. Sidebar (rebuilt — collapsible, reordered, renamed)

```
┌─────────────────────┐
│  ☰  Sentinel        │  ← [click to collapse to icon-only]
├─────────────────────┤
│ OPERATIONS          │
│  ▢ Dashboard        │
│  ▢ Clients          │  ← was below Guards (now above per A1)
│  ▢ Employees        │  ← was "Guards" (per A3)
│  ▢ Assignments      │
├─────────────────────┤
│ PAYROLL             │
│  ▢ DTR              │
│  ▢ Pay Runs         │
│  ▢ Payslips         │
├─────────────────────┤
│ COMPLIANCE          │
│  ▢ Government Exports
├─────────────────────┤
│ ADMIN               │
│  ▢ Settings         │
│  ▢ Audit Log        │
└─────────────────────┘
  [user]  [logout]
```

**Collapsed state** (icon-only): full sidebar shrinks to a 48px-wide rail of icons. Tooltips show the label on hover. Auto-collapses below 1024px viewport. State persists in localStorage.

### W2. Employees list (was Guards)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Employees                                                            │
│  All people on the CGoC payroll — guards, office staff, supervisors.  │
├──────────────────────────────────────────────────────────────────────┤
│ [🔍 Search by name, employee code, ...        ] [Filter: All ▾] [+ Add]│
│                                            (employment_type filter)    │
├──────────────────────────────────────────────────────────────────────┤
│ ☐ │ Code    │ Name          ↕│ Type     ↕│ Status   ↕│ Detachment    │
├──┼─────────┼────────────────┼──────────┼──────────┼────────────────┤
│ ☐│ CG-0001 │ Cruz, Juan     │ GUARD    │ deployed │ SM Aura Post 1 │
│ ☐│ CG-0002 │ Reyes, Maria   │ OFFICE   │ deployed │ HQ Admin       │
│ ☐│ CG-0003 │ Santos, Pedro  │ GUARD    │ floating │ —              │
│ ...                                                                   │
├──────────────────────────────────────────────────────────────────────┤
│  Showing 1–25 of 100   [‹ Prev]  Page 1 / 4  [Next ›]                 │
└──────────────────────────────────────────────────────────────────────┘

[when ≥1 row selected, a sticky bar appears above the table:]
┌──────────────────────────────────────────────────────────────────────┐
│ 3 selected   [Assign to detachment...] [Change status...] [Export]   │
└──────────────────────────────────────────────────────────────────────┘
```

Behavior:
- **Search input** (top-left): debounced 250ms. Searches `last_name`, `first_name`, `employee_code`. Server-side, uses `pg_trgm` for fuzzy match. (C1+C2)
- **Filter dropdown** (top-mid): filters by `employment_type` (All / Guard / Office Staff / Supervisor / Driver / Janitor / Other) — also reflected in URL `?type=GUARD`. (A3 filter surface)
- **Column sort arrows** (`↕`): click header to sort asc, click again for desc. State in URL `?sort=last_name&dir=asc`. (B3)
- **Row checkboxes** (`☐`): per-row select; header checkbox toggles all-on-page. Selected count + bulk-action bar appears sticky at top of table. (B4)
- **Whole row clickable** (outside the checkbox): navigates to employee detail page. Hover state: row-bg lift + cursor:pointer. Kebab menu (`⋮`) on right of row for secondary actions. (B1)
- **Default sort:** last_name asc.
- **Empty state:** "No employees yet — [Import from CSV] or [+ Add manually]." If filter active: "No employees match this filter — clear filter." (C4)

### W3. Detachments list (with required_headcount surface)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Detachments                                                          │
│  Posts where employees are deployed. Each has a contracted headcount.│
├──────────────────────────────────────────────────────────────────────┤
│ [🔍 Search detachment or client...    ] [Filter: All clients ▾] [+ Add]│
├──────────────────────────────────────────────────────────────────────┤
│ Detachment     ↕│ Client       ↕│ Deployed / Required│ Gap   │ Actions│
├─────────────────┼────────────────┼─────────────────────┼───────┼────────┤
│ SM Aura Post 1  │ SM Prime       │ 8 / 10   ████████░░ │ -2 ⚠ │  ⋮     │
│ SM Aura Post 2  │ SM Prime       │ 10 / 10  ██████████ │  0   │  ⋮     │
│ Ayala HQ Lobby  │ Ayala Land     │ 4 / 6    ███████░░░ │ -2 ⚠ │  ⋮     │
│ BGC Patrol      │ Ayala Land     │ 12 / 10  ██████████ │ +2   │  ⋮     │
│ ...                                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

Behavior:
- **Deployed / Required column:** number-pair + a 10-segment progress bar. Color-codes: red (gap > 20% of required), amber (any gap), green (met or over). (E1)
- **Gap column:** signed integer + warning icon when negative. Sortable. Click `-2 ⚠` opens a side panel listing the recruitment-request hint (Slice 3 will turn this into a real Recruitment task; for Slice 2 it just shows the gap and a "Mark as known" admin action).
- Same row/search/sort/multi-select affordances as W2.

### W4. Assignments list + create flow (multi-select + typeahead)

**List view:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  Assignments                                                          │
│  Where each employee is currently deployed.                           │
├──────────────────────────────────────────────────────────────────────┤
│ [🔍 Search ...] [Filter: Active ▾] [+ New Assignment]                 │
├──────────────────────────────────────────────────────────────────────┤
│ ☐ │ Employee       │ Detachment    │ Client     │ Start      │ End   │
├──┼────────────────┼────────────────┼────────────┼────────────┼────────┤
│ ☐│ Cruz, Juan     │ SM Aura Post 1 │ SM Prime   │ 2026-04-01 │ —     │
│ ☐│ Reyes, Maria   │ HQ Admin       │ Internal   │ 2026-01-15 │ —     │
│ ...                                                                   │
└──────────────────────────────────────────────────────────────────────┘

[multi-select bar (when rows selected):]
│ 5 selected   [Transfer to detachment...] [End assignment...]         │
```

**Create form** (modal or page):
```
┌─────────────────────────────────────────────────────┐
│  New Assignment                                      │
├─────────────────────────────────────────────────────┤
│  Employee                                            │
│  [Cruz, Juan (CG-0001)            ▾]                │
│   ▶ Type to search: "cru"                            │
│      Cruz, Juan      (CG-0001)  deployed             │
│      Cruz, Ana       (CG-0042)  floating             │
│      Cruzal, Pedro   (CG-0117)  deployed             │
│   ─ press ↑↓ to navigate, ↵ to select ─              │
│                                                      │
│  Detachment                                          │
│  [SM Aura Post 1                  ▾]                │
│                                                      │
│  Start date                                          │
│  [2026-05-24]                                        │
│                                                      │
│         [Cancel]    [Create Assignment]              │
└─────────────────────────────────────────────────────┘
```

Behavior:
- **Employee field:** typeahead — fires on 2+ chars, debounced 250ms, server returns top 20 matches by `pg_trgm` rank. Shows code + name + current status. Keyboard nav. (C1)
- **Detachment field:** same typeahead pattern, includes client name in the option line.
- **Sticky default:** detachment field auto-pre-fills with the last-chosen value in the same session (clerks usually batch-assign to one post). (C3)
- **Bulk "Transfer to detachment":** opens the same typeahead modal but operates on all selected rows. (B4)

### W5. DTR + Pay Runs with cut-off / payday surface

**DTR page header:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  DTR — May 16–31, 2026                                                │
│  Record daily time-in/out for active employees.                       │
├──────────────────────────────────────────────────────────────────────┤
│ ⏰ DTR submission due: Jun 2, 2026 (in 2 days)                        │
│ 💸 Payday: Jun 5, 2026 (in 5 days)                                   │
│ Status: 78 of 100 employees logged          [Close period]            │
└──────────────────────────────────────────────────────────────────────┘
```

**Pay Runs page header:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  Pay Run — May 16–31, 2026 (SM Prime detachments)                    │
│  Status: locked   Payday: Jun 5, 2026 (in 5 days)                    │
├──────────────────────────────────────────────────────────────────────┤
│ Payroll Calendar: SM Prime — Semi-monthly                            │
│ • Worked period:  May 16 – May 31                                    │
│ • DTR submission: due Jun 2     ✓ closed Jun 1                       │
│ • Payday:         Jun 5         (5 days)                             │
└──────────────────────────────────────────────────────────────────────┘
```

Behavior:
- Cut-off / payday calendar is **per-client config** (some clients pay 5th + 20th, others 10th + 25th, etc). New `payroll_calendars` table joined on `client_id`. (F1)
- Countdown badge updates daily.
- If DTR is closed late (past `dtr_cutoff_date`), a non-blocking warning banner appears: "DTR closed 1 day past cut-off — payday may slip." Logged to audit.

### Other affected screens

These need design but the wireframe is a structural pattern, not a novel layout:

- **Employee detail page:** opens in **read-only view-mode by default**; top-right `[Edit]` button switches to editable form with `[Save]` / `[Cancel]`; navigating away with unsaved changes triggers a dirty-state warning dialog. All fields editable except `id`, `created_at`, `employee_code` (the latter is the natural key — changing it would break payslip history references). (B2 + D1)
- **Employee edit form:** same field set as the create form, plus the new `employment_type` field as a dropdown. Status changes go through a separate `[Change Status]` button that opens the existing `hr.changeStatus` flow (with reason text required) — status is not just-another-form-field because the state machine matters.
- **Client list + Client detail/edit:** same view-mode-default + Edit pattern. Detail page shows client info + list of their detachments. (D1, D3)
- **Detachment detail/edit:** view-mode-default. Edit form adds the `required_headcount` field + a `[Payroll Calendar]` sub-section where the per-client cut-off rules are set if not already inherited from client default. (D1, E1, F1)
- **BIR 2316 export:** completes the form's IVB fields (year-to-date totals), RDO code, employee DOB, employee address. UI: the existing single-employee export page just produces a more-complete PDF. No new screen needed. (Slice-1-deferred completion)

---

## UX walk-through

The Slice 2 demo, narrated as a payroll clerk would experience it. Read this *before* the Components section. If a step here requires a field that isn't in Components, the schema is wrong, not the walk-through.

**Setup phase — Onboarding the agency**

1. Clerk logs in (Slice 0 auth). Lands on Dashboard. Sidebar shows reordered Operations section: Dashboard → Clients → Employees → Assignments.
2. Clerk goes to **Clients**, clicks `[+ Add]`. Creates "SM Prime", "Ayala Land", "Robinsons Land", "Megaworld", "Filinvest". On each client form, sets `default_payroll_calendar`: semi-monthly cut-offs (5th and 20th, semi-monthly payday).
3. Clerk goes to **Detachments**, creates 10 detachments — 2 per client. For each, sets `required_headcount` (e.g. SM Aura Post 1 = 10, Ayala HQ Lobby = 6, etc).
4. Clerk goes to **Employees**, clicks **Import from CSV**. Imports a 100-row CSV with mixed `employment_type` (80 GUARDs, 15 OFFICE_STAFF, 3 SUPERVISORs, 2 DRIVERs). Per-row errors surfaced (per Slice 1's M-3 fix). All 100 imported.
5. Clerk filters Employees list by `Type: GUARD` (80 visible). Sorts by `last_name`. Selects all 80 via header checkbox. Clicks `[Assign to detachment...]` from the sticky bulk-action bar.
6. Modal opens: typeahead picker for detachment. Clerk types "SM Aura" → selects "SM Aura Post 1". Sets start date. Confirms. **50 employees assigned to that one detachment in one click.** Clerk repeats for the other 9 detachments via filter + multi-select. (Worst case: 10 batches, ~1 minute total.)
7. Clerk goes to **Detachments**. Sees the "8 / 10 deployed" badges populate as employees are assigned. Two detachments still under-strength (deliberate — to test the gap surface).

**Operating phase — Running payroll for the period**

8. Clerk goes to **DTR** for period May 16–31. Header shows: "DTR submission due Jun 2 (in 2 days)" + "Payday: Jun 5 (in 5 days)" based on SM Prime's calendar (the demo data has all 5 clients on the same calendar to keep the story simple; the modeling supports per-client divergence).
9. Clerk enters DTR for 100 employees. Typeahead employee picker; sticky default for period; sortable + searchable table. ~15 min instead of the Slice 1 click-fest.
10. Clerk clicks **Close period**. Confirmation dialog. Period closes; `dtr.period.closed` fires; payroll auto-runs.
11. Clerk goes to **Pay Runs**. Sees one run per client (5 runs total — splitting by `client_id` is already Slice 1's behavior via assignment FK). Each shows status + payday countdown. Clerk reviews payslips per client. Numbers reconcile within ₱1 of v2 (Slice 1's regression rule still applies).

**Compliance phase — Exporting for regulators**

12. Clerk goes to **Government Exports**. Selects period. Exports **SSS R3** (Slice 1 ability, still works). Exports **BIR 2316** for one named employee — opens the PDF, sees all IVB fields populated (year-to-date totals), RDO code, DOB, address. *Complete form, not a placeholder.* Hands to BIR ready-to-file.

**Edit phase — Fixing a typo**

13. Clerk realizes "Cruz, Juan" was imported as "Cruz, Jaun". Goes to Employees, searches "Cruz", clicks row. Detail page opens read-only. Clicks `[Edit]`. Fixes the name. Clicks `[Save]`. Audit log records who changed what.
14. Clerk realizes one client name is wrong. Same flow on Client detail page. Audit logged.

That's the demo. End of slice.

---

## Components

(Sits on top of Slice 0 primitives + Slice 1 modules. Slice 2 adds fields, adds APIs, and adds one new module for payroll-calendar.)

### 1. `modules/hr` — `employment_type` + Edit

- **New field on `employees`:** `employment_type` enum (`GUARD | OFFICE_STAFF | SUPERVISOR | DRIVER | JANITOR | OTHER`), default `GUARD`. Backfill all existing rows to `GUARD`.
- **New public API:**
  - `hr.updateEmployee(id, patch) → Employee` — partial update. Cannot change `id`, `employee_code`, `created_at`. Emits `hr.employee.updated`. All changes audit-logged with before/after snapshot.
  - `hr.searchEmployees(query, { limit?, employmentType?, status? }) → Employee[]` — typeahead-backing endpoint. Uses `pg_trgm` for fuzzy match on `first_name`, `last_name`, `employee_code`. Default limit 20.
- **Existing APIs unchanged.** `createEmployee` accepts `employment_type` in input; defaults to `GUARD` if omitted.
- **Index migrations:**
  - `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  - `CREATE INDEX employees_name_trgm ON employees USING gin ((first_name || ' ' || last_name) gin_trgm_ops);`
  - `CREATE INDEX employees_code_trgm ON employees USING gin (employee_code gin_trgm_ops);`
- **README updates:** new failure modes — pg_trgm extension missing, employment_type backfill incomplete.

### 2. `modules/clients` — Edit + `required_headcount` + `default_payroll_calendar`

- **New fields:**
  - `detachments.required_headcount` int (nullable; null = not yet contracted) — defaults to null on backfill.
  - `clients.default_payroll_calendar_id` FK to `payroll_calendars` (nullable until set).
- **New public API:**
  - `clients.updateClient(id, patch) → Client`
  - `clients.updateDetachment(id, patch) → Detachment`
  - `clients.getDetachmentDeploymentSummary(id) → { required: number | null, deployed: number, gap: number | null }`
    - `deployed` = count of active assignments at `now()`.
    - `gap` = `deployed - required` (null if `required` is null).
  - `clients.listDetachmentsWithDeployment(clientId?) → DetachmentWithGap[]` — list endpoint that includes the deployment summary inline (avoids N+1 from the UI table).
- **Existing `createClient` / `createDetachment` accept the new fields.**
- **Updates audit-logged** with before/after snapshot.

### 3. `modules/assignments` — Bulk + Edit

- **New public API:**
  - `assignments.bulkAssign(employeeIds[], detachmentId, startDate) → { assigned: Assignment[], errors: { employeeId, reason }[] }` — assigns N employees to one detachment in one call. Per-employee errors don't abort the batch (per Slice 1's C-3 pattern). Emits one `assignment.created` per success.
  - `assignments.bulkEndAssignments(assignmentIds[], endDate, reason) → { ended: Assignment[], errors: ... }`
  - `assignments.bulkTransfer(employeeIds[], toDetachmentId, transferDate) → { ... }` — convenience: ends current active assignment + starts new one, in one transaction per employee.
  - `assignments.updateAssignment(id, patch) → Assignment` — only `start_date`, `end_date`, `reason` editable; can't change `employee_id` or `detachment_id` (delete + re-create instead, with audit trail).
- **Pagination on `assignments.list`:** Slice 1 returned everything. Slice 2 paginates (`limit`, `offset`, default 50). Required for the multi-select table at 10k scale.
- **README updates:** new failure modes — bulk operation partial-failure, transfer date in the past, transfer to same detachment.

### 4. `modules/payroll-calendars` — **NEW MODULE**

- **Purpose:** model per-client cut-off and payday dates. Drives the countdown badges on DTR + Pay Runs.
- **Public API** (`modules/payroll-calendars/index.ts`):
  - `payrollCalendars.create(clientId, data) → PayrollCalendar`
  - `payrollCalendars.update(id, patch) → PayrollCalendar`
  - `payrollCalendars.getForClient(clientId) → PayrollCalendar | null`
  - `payrollCalendars.resolveForPeriod(clientId, periodStart, periodEnd) → { dtrCutoffDate: Date, paydayDate: Date }` — computes the dates for a given worked-period based on the client's calendar rules.
- **Schema:** `payroll_calendars` table with `client_id` (nullable for global default), `frequency` (`SEMI_MONTHLY` | `MONTHLY` | `WEEKLY`), `cutoff_rule` (e.g. "2 days after period end" / "5th of next month"), `payday_rule` (similar). Rules stored as a small DSL (or just two int fields for "days after period end" — start with the simple shape, extend later).
- **Subscribes to:** nothing in Slice 2. Read-only from DTR + Pay Runs UI.
- **Audit:** every calendar change audit-logged. Past pay runs are not affected by future calendar changes (calendar resolution is captured at pay-run-creation time and frozen on the run).

### 5. `modules/compliance-exports` — BIR 2316 completion

- **No new API.** `complianceExports.exportBIR_2316(employeeId, year)` continues to be the entry point.
- **Implementation changes:**
  - Populate full IVB section (year-to-date gross, deductions per category, net).
  - Pull RDO code from new `employees.rdo_code` field (varchar(3); backfill required-empty; surfaces a per-employee warning if missing at export time — does not block export, just flags).
  - Pull DOB from new `employees.date_of_birth` field (date, nullable). Backfill empty.
  - Pull address from new `employees.address_line1`, `address_line2`, `city`, `province`, `postal_code` fields. Backfill empty.
  - PDF generation (Slice 1 shipped HTML; Slice 2 ships a PDF that matches BIR's official form layout). Use `puppeteer` or `@react-pdf/renderer` — implementation plan picks one.
- **`hr.createEmployee` + bulk import + edit form** accept the new fields. Sample CSV updated to include columns. Existing employees without these fields surface a warning chip on the Employee detail page ("BIR 2316 export incomplete — RDO and DOB missing").

### 6. Cross-cutting (Slice 2)

- **Sidebar rebuild** ([`app/(admin)/layout.tsx`](../../app/%28admin%29/layout.tsx)): collapsible (localStorage-persisted), section reorder, "Guards" → "Employees" rename throughout copy. Below 1024px auto-collapses. (A1 + A2 + A3 copy)
- **Table component refactor** ([`components/data-table.tsx`](../../components/data-table.tsx) or new shared component): sortable headers, row-click navigation, multi-select checkboxes, kebab actions, sticky bulk-action bar, URL-state for sort + filter + page. Used by Employees, Clients, Detachments, Assignments, Pay Runs.
- **Search input component** (debounced + URL-state). Used by all list pages.
- **Typeahead component** (server-backed, generic over the search API). Used by Assignment + DTR + employee/detachment pickers.
- **View-mode-default detail layout**: shared layout component for detail pages — read-only fields by default, `[Edit]` toggles to form-mode, dirty-state navigation guard. Used by Employee, Client, Detachment, Assignment detail pages.
- **Audit log surface:** every Edit action lands in the existing `audit` table; Slice 2 does not yet build an Admin → Audit Log viewer screen (that ships when there's enough volume to be worth a screen — probably Slice 3 or 4).
- **`.env.example`** updated for any new env vars (PDF rendering may add a Puppeteer chromium path).
- **Per-module README** updated for all touched modules with the new failure modes section.

---

## Cross-module contracts

| Caller | Calls | Notes |
|---|---|---|
| `assignments.bulkAssign` | `hr.getEmployee` per id (validation), `assignments.assign` per id, `audit.record` per success, `events.publish('assignment.created')` per success | Per-row errors aggregated; one bad row does not abort the batch. |
| `clients.listDetachmentsWithDeployment` | `assignments.listActiveAssignments` (existing) joined in SQL | Avoid N+1 — implement as a single JOIN query, not a loop. |
| `payroll-calendars.resolveForPeriod` | reads `clients.default_payroll_calendar_id` and `payroll_calendars.*` | Captures resolved dates onto the pay run at creation time (frozen). |
| `payroll.runPayroll` | `payroll-calendars.resolveForPeriod` per client in the period | New dependency added to Slice 1's payroll module. Pay runs gain `dtr_cutoff_date` + `payday_date` columns. |
| `compliance-exports.exportBIR_2316` | reads new `employees.rdo_code`, `date_of_birth`, address fields | If fields missing, warn but don't block — emit a warning event captured in audit. |
| every list page | `<DataTable>` shared component, `<SearchInput>`, `<Typeahead>` | UI components live in `components/` per Next.js convention; not a new module. |
| every Edit save | `audit.record` with before/after snapshot | Per ADR-0013 invariant: master-data history is never destroyed. |

All cross-module calls go through `index.ts` per [AGENTS.md](../../AGENTS.md) modular construction rule 4.

---

## Done criteria

Slice 2 is done when **all** of the following are true:

1. **Sidebar:** Operations section reordered Dashboard → Clients → Employees → Assignments. "Guards" everywhere renamed to "Employees." Sidebar collapses on click + auto-collapses below 1024px. State persists.
2. **Employees list:** server-side search (typeahead-style, ~250ms debounce, `pg_trgm`-backed), `employment_type` filter, sortable headers, multi-select checkboxes with sticky bulk-action bar, whole-row clickable. Default sort `last_name` asc. Empty state distinguishes "nothing exists" from "nothing matches filter."
3. **Employees CSV import:** sample CSV includes `employment_type` column. Bulk import accepts the new field; defaults to `GUARD` on omission.
4. **Employee detail/edit:** opens read-only; `[Edit]` button toggles editable form with `[Save]` / `[Cancel]`; dirty-state navigation guard active. All fields editable except `id`, `employee_code`, `created_at`. Audit log records before/after on save.
5. **Clients + Detachments:** edit flow works same way (view-mode default, Edit button, dirty-state guard, audit log). New `required_headcount` field on detachments.
6. **Detachments list** surfaces deployment summary: progress bar + numeric `8 / 10` + gap indicator with color band (red >20% gap, amber any gap, green met-or-over). Sortable by gap. Filter by client.
7. **Assignments list:** paginated (default 50 per page), multi-select, bulk-assign + bulk-end + bulk-transfer actions work end-to-end. Typeahead employee + detachment pickers on the create form.
8. **Payroll calendar:** per-client `payroll_calendars` table populated by client form. `payroll-calendars.resolveForPeriod` returns correct cut-off + payday dates for the demo data. DTR + Pay Runs pages show the two countdown badges. Calendar resolved-values are frozen onto each pay run at creation.
9. **Pay run creation** captures `dtr_cutoff_date` + `payday_date` on the run row. Late DTR closure (past cut-off) shows non-blocking warning + audit log entry.
10. **BIR 2316 export** produces a PDF with the full IVB section populated, RDO code, DOB, and address. Missing fields surface as warnings on the Employee detail page; export proceeds but flags the gap.
11. **Demo script:** the 14-step UX walk-through above runs end-to-end via [`directives/slice-2-bootstrap.md`](../../directives/slice-2-bootstrap.md) (TO BE WRITTEN during implementation) on a 100-employee / 5-client / 10-detachment seed dataset. Total clerk time ≤ 30 minutes (including the data entry — the demo measures *whether the UI gets out of the way*).
12. **Regression gate:** Slice 0 + Slice 1 smoke tests still pass. Specifically: Slice 1's "10 guards, 1 detachment, ₱1-reconciliation" demo still passes unchanged on Slice 2's codebase.
13. **Per-module README** updated for `hr`, `clients`, `assignments`, `compliance-exports`. New module `payroll-calendars` has a fresh README (Purpose / Public API / Dependencies / Known failure modes).
14. **CI is green on `main`.**
15. **UX bar:** a CGoC payroll clerk who has never seen the system before can complete the 14-step walk-through without coaching. (Same bar as Slice 1; raised by the scale.)

If any of the above is not true, Slice 2 is not done.

---

## Discipline rules baked in (per [ADR 0013](../decisions/0013-vertical-slices-over-horizontal-phases.md) + Slice-1 UX-walk meta-finding)

- **Wireframes precede schema.** The Wireframes + UX walk-through sections in this contract were drafted *before* the Components section. If implementation hits a UI gap, this contract is updated **before** code diverges. (Per [`1-first-payslip-ux-walk-findings.md`](1-first-payslip-ux-walk-findings.md) §J1.)
- **Slice 2 cannot break Slice 1's primitives.** Slice 1's payroll reconciliation test re-runs as a regression gate. The 10-guard / 1-detachment demo still works.
- **No new payroll math, no new compliance exports** (beyond completing Slice 1's BIR 2316). Out-of-scope items stay out — see §Out of scope.
- **V2-schema-first rule still applies** ([Slice 1 rule]): new fields on employees (RDO, DOB, address, `employment_type`) checked against `ref/compliance/` v2 shape before introduction.
- **No `tenant_id` columns** anywhere ([ADR 0007](../decisions/0007-multi-tenancy.md)). `client_id` FK where per-client config applies.
- **Master-record edits never destroy history.** Soft-update via versioned audit log; hard-delete only for the never-used-imported-by-mistake case, with explicit double-confirm dialog.
- **Slice ends at demo pass, not "code looks done."**

---

## Open questions resolved during drafting

- **Slice 2 scope:** Tier-1 (9 items) + Slice-1-deferred BIR 2316 completion. Tier-2 polish, Tier-3 compliance/scale, Slice-4 portal explicitly deferred. Bundling Tier-1+2+3 would make the slice undemoable. (Decision per delegation framework — Claude calls the shot, Noel corrects if wrong.)
- **PDF library for 2316:** TBD during implementation plan. `@react-pdf/renderer` (pure JS, no chromium) leans the default unless layout fidelity demands Puppeteer.
- **Search backend:** `pg_trgm` extension + GIN indexes on name + employee_code. Postgres-native, no external search service.
- **Multi-select scale ceiling:** Slice 2 supports up to ~500 selected rows per bulk action (one detachment's worth, with margin). Above that, batching via background job — deferred until needed.
- **Per-client calendar override vs global default:** schema supports both — `payroll_calendars.client_id` nullable. Demo uses one calendar across all 5 clients to keep the narrative simple; the modeling supports divergence on day one.
- **Bulk-transfer atomicity:** per-employee transactional (end-old + start-new in one TX per employee), not batch-atomic. One failed employee doesn't abort others. Same pattern as Slice 1's payroll C-3 fix.

---

## Out of scope (do not creep)

- **Tier-2 polish from UX-walk findings** — sidebar reorder is in (A1), but row-click (B1), view-mode-default (B2), sortable headers (B3), sticky defaults (C3), empty-state diagnostics (C4), dropdown padding (C5), terminate UI (D2), soft-delete (D3) → next slice (Slice 2.5 or absorbed into Slice 3).
  - *Note: a subset of these — B1 row-click, B2 view-mode-default, B3 sortable headers — are actually included because they're inherent to the table component refactor and the detail-page layout that Slice 2 already needs. The remaining ones are deferred.*
- **Tier-3 compliance/scale** — rate-table `last_verified_at` (G1), historical rate tables (G3), bulk BIR 2316 ZIP (H1), BIR Alphalist (H2) → later slice.
- **Tier-4** — regulator scrape-and-alert (G2), Employee Self-Service portal (Slice 4).
- **New payroll math** — holiday/rest-day stacks, NSD, 13th-month, leave credits, loan deductions → rate-stack engine slice.
- **New compliance exports beyond 2316 completion** — PhilHealth + Pag-IBIG remittance, Alphalist, 1601-C → later.
- **Recruitment / ATS / Marketing-writes-required_headcount workflow** — Slice 2 lets super-admin set `required_headcount`; the Marketing-writes / Recruitment-reads / Ops-reads ownership chain (E2 full) lands in Slice 3 when those modules ship.
- **Per-cell DTR editor** (slice-1-deferred polish) — defer to whichever slice tightens DTR UX.
- **Role/permission engine** — super-admin only, same as Slice 1.
- **Admin audit-log viewer screen** — audit data is written; the viewer is later when there's enough volume to justify a screen.
- **In-app AI agent** (the per-department conversational query feature) — separate future slice, see `memory/project_in_app_ai_agent_feature.md`. Not even brainstormed at contract level yet.
- **Production-readiness items** — feature flags, Sentry instrumentation, runbooks, DB backup drills — tracked in `memory/project_pre_production_gaps.md`; not slice work.
