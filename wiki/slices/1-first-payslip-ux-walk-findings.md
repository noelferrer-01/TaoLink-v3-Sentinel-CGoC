# Slice 1 — UX walk findings (2026-05-24)

**Source:** Noel walked the Slice 1 demo end-to-end against [`directives/slice-1-bootstrap.md`](../../directives/slice-1-bootstrap.md) on a local fresh-ish DB. Findings collected live during the walk.
**Two real Slice-1 bugs fixed during the walk** (committed alongside this doc). Everything else is **Slice-2 polish** — feeds the Slice 2 contract scoping.

The point of capturing this here is twofold: (1) so nothing falls on the floor when Slice 2 planning starts, (2) so future slices learn from what went wrong — the meta-finding being that **UI design should happen at slice-contract-drafting time, not after schema is locked.**

---

## Fixed during the walk (Slice 1 bugs)

| # | Bug | Where | Fix |
|---|---|---|---|
| **B1** | DTR page showed "0 ACTIVE GUARDS" when guards had assignments overlapping the period but starting *inside* it. Query filtered `start_date <= period_start` instead of period overlap. | [`modules/assignments/service.ts`](../../modules/assignments/service.ts), [`app/(admin)/dtr/page.tsx`](../../app/%28admin%29/dtr/page.tsx) | Added `assignments.listAssignmentsOverlappingPeriod(periodStart, periodEnd)` with correct overlap predicate; DTR page now calls it. |
| **B2** | Import page promised a sample CSV download in the directive but didn't actually link to one. Clerks landed on the page with no idea what columns to fill. | [`app/(admin)/employees/import/page.tsx`](../../app/%28admin%29/employees/import/page.tsx) | Added a `Download the sample CSV (10 rows)` link pointing at `/hr-employees-sample.csv` (which Next.js serves from `public/`), plus an inline list of expected columns. |

---

## Slice-2 polish backlog (everything else)

### A. Sidebar & navigation

- **A1. Reorder Operations section** to workflow-natural reading order: **Dashboard → Clients → Guards → Assignments** (currently Dashboard → Guards → Clients → Assignments). Reasoning: Operations is the *setup* section; setup story reads "overview → demand → supply → matching." Payroll section ordering is fine.
- **A2. Collapsible sidebar.** Toggle to fold sidebar to icon-only (Linear / Stripe / GitHub pattern); auto-collapse below 1024px viewport. Wide tables (Pay Runs, Government Exports, eventually the payslip register) need the horizontal real-estate.
- **A3. Rename Guards → Employees** in the sidebar + page headers, AND add `employment_type` enum on `employees` schema (`GUARD | OFFICE_STAFF | SUPERVISOR | DRIVER | JANITOR | OTHER`, default `GUARD` for backfill). CGoC isn't only guards — office staff need the same payroll engine. Tagging by role gives filterability without forking the schema.

### B. Tables — interactions & affordances

- **B1. Whole-row clickable** on every list table (Guards, Clients, Detachments, Assignments, Pay Runs). Hover state (background lift + cursor:pointer); kebab menu at right for secondary actions (Archive / Duplicate / Export). Primary view action via row-click.
- **B2. View-mode by default, explicit Edit button.** Detail page opens read-only; mutate-actions require explicit click + Save/Cancel + unsaved-changes navigation guard. Payroll is high-stakes — accidental-edit prevention is non-negotiable. (DTR per-cell ambient editing is the deliberate exception — already tracked separately.)
- **B3. Sortable column headers** on every list table — click to sort asc, click again to reverse. Persist last-used sort per table in URL/session.
- **B4. Multi-select rows** on Assignments (and likely Guards, Pay Runs). Backend already supports it — UI just needs checkboxes + a "Apply to selected" action. Single-row-at-a-time is structurally unusable at CGoC's 10,000-guard scale.

### C. Search & forms

- **C1. Form-field typeahead** (autocomplete) on guard / detachment / client pickers in every create-form. Debounced ~250ms, returns top 10–20 matches. Requires DB indexes on `last_name`, `employee_code`; consider `pg_trgm` for fuzzy match.
- **C2. Table-filter search** at top of every list page — debounced text filter against the obvious fields per table. Same indexes as C1.
- **C3. Sticky form defaults.** Last-chosen value persists within a session for fields that almost always repeat across sequential entries: detachment on Assignments, period on DTR, client on new Detachments, pay-frequency on new Employees. Tiny client-side memory, big perceived speedup for batch entry.
- **C4. Empty-state diagnostics are too generic.** DTR's "No guards to record for this period" said "Assign at least one guard first" even though 11 assignments existed — the real cause was period-overlap (fixed in B1). Empty states need to differentiate "nothing exists" from "nothing matches this filter/period."
- **C5. Dropdown arrows too close to right edge.** Native `<select>` styling needs `padding-right: ~2.5rem` so the arrow has breathing room.

### D. Master-data CRUD gaps

- **D1. Add Edit on every master record** (clients, detachments, employees, assignments). Currently create-only. Without edit, a typo means delete-and-re-create, which usually isn't possible due to FK constraints.
- **D2. No hard Delete on employees who have history** (DTR rows, payslips, audit entries). BIR mandates 10-year retention. Use **status → terminated** (the `hr.changeStatus` API exists; wire it to the UI). Hard delete only for the very narrow "imported by mistake, never used" case, with a safety check.
- **D3. Edit on detachments / clients** follows the same rule — soft-delete via a `removed` flag if needed for clean lists, never destroy history.

### E. Detachment / contract modeling

- **E1. Add `required_headcount`** field on `detachments` so each post tracks its contracted post strength. Surfaces as "3 / 10 deployed" badges on the Detachments list and feeds Recruitment's "deployment gap" view in Slice 3.
- **E2. Ownership chain** (per ADR 0001 + meeting notes): **Marketing writes** the required headcount (signs contract); **Recruitment reads + has write authority** to assign/transfer guards to fill it; **Operations reads** and raises requests when gaps appear (cannot execute transfers). Slice 1 super-admin sets it directly; Slice 2 starts that handoff; Slice 3 finishes it when Marketing module ships.

### F. Payroll calendar concepts

- **F1. Cut-off / payday calendar.** Sentinel currently models only the *worked period* (1–15, 16–end). PH payroll also needs `dtr_cutoff_date` (DTR submission deadline) and `payday_date` (when bank disbursement hits). Add to `pay_runs` or as `payroll_calendar` per-client config; surface as countdown badges on DTR + Pay Runs pages.

### G. Compliance / regulator integration

- **G1. Rate-table `last_verified_at` + admin reminder.** No PH government regulator exposes a machine-readable rate API (SSS, BIR, PhilHealth, HDMF publish PDFs and circulars). Add `last_verified_at` per rate row and surface a quarterly "verify rates" task on the dashboard ("SSS rates last verified 91 days ago — check for new circulars").
- **G2. Optional scrape-and-alert** (later): weekly cron that fetches regulator circular listings and diffs against seeded rates; alerts admin on change; never auto-applies. Skip until manual cycle proves insufficient.
- **G3. Historical rate tables.** Current seed has only one effective_date (`2026-01-01`). Back-dated payroll runs would use today's rates against last-year periods. Schema needs `effective_date_start` + `effective_date_end` ranges and back-fill of prior years (especially the 2018 TRAIN Law brackets, the 2023 BIR rate change, and the SSS rate progressions).

### H. Government exports — at-scale workflows

- **H1. Bulk BIR 2316 generation.** Per-employee export is fine for ad-hoc reissues but unusable at year-end with 10k guards. Add "Generate all 2316s for YYYY" → ZIP of one PDF per employee. One click for the whole agency.
- **H2. BIR Alphalist (1604-C / 1604-CF).** Annual summary BIR actually files (vs the individual 2316 each employee receives). Separate format, separate export. Required Jan/Feb annually.

### I. Employee self-service (own slice)

- **I1. Employee portal — payslip download for guards themselves.** Standard PH employer obligation. At CGoC's scale, removes the daily "please send me my payslip" workload from HR. Probably **Slice 4 (Employee Self-Service)** with logins, payslip view, leave request, profile update, contact info edits.

### J. UI design process (meta)

- **J1. Move UI design to slice-contract stage, not implementation phase 8.** This walk surfaced ~15 findings. The vast majority would have been caught at contract time if every screen the slice ships were wireframed during contract drafting. The wireframe should drive the schema, not the other way around. Add to slice contract template:
  - **Wireframes** section — one sketch per screen, embedded in the contract markdown
  - **UX walk-through** section — text walking the user mental model through each screen, written *before* code

  Slice 1 got away with schema-first because HRIS basics are well-trodden. Slice 3 (Recruitment workflows, approval gates, multi-role notifications) and Slice 4 (mobile-first employee portal) won't.

---

## Priority guide for Slice 2 planning

Not all items above are equal. When drafting Slice 2 contract, sequence roughly:

**Tier 1 — demo-blockers at CGoC scale.** Without these, the 10,000-guard demo embarrasses us.
- A2 (collapsible sidebar), A3 (Guards→Employees rename + employment_type), B4 (multi-select), C1+C2 (typeahead + table search), D1 (edit on master records), E1+E2 (required headcount + ownership chain), F1 (cut-off / payday)

**Tier 2 — clerk-quality-of-life polish.**
- A1 (sidebar reorder), B1 (row-click), B2 (view-mode default), B3 (sortable headers), C3 (sticky defaults), C4 (empty-state diagnostics), C5 (dropdown padding), D2 (terminate UI), D3 (soft-delete elsewhere)

**Tier 3 — compliance and scale.**
- G1 (last_verified_at), G3 (historical rate tables), H1 (bulk 2316), H2 (Alphalist)

**Tier 4 — own slice later.**
- G2 (regulator scrape-and-alert), I1 (employee portal — Slice 4)

**Cross-cutting process change (effective immediately):**
- J1 (UI design at contract stage — applies to Slice 2 and every slice after)
