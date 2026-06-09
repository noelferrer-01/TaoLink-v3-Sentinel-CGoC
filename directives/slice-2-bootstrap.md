# Directive — Slice 2 bootstrap

> SOP for the Slice 2 end-to-end demo: **5 clients, 10 detachments, 100 employees with mixed employment types, bulk assign at scale, DTR for the whole roster, per-client pay runs, BIR 2316 PDF, and an audited typo-fix.**
>
> Use this script for: a fresh dev verifying the slice locally, a clean demo session for a stakeholder, or the manual portion of the Phase 10 Done-criteria sweep.

## Inputs

- Slice 0 + Slice 1 bootstraps already done. See [`slice-0-bootstrap.md`](slice-0-bootstrap.md) and [`slice-1-bootstrap.md`](slice-1-bootstrap.md) if not. Slice 1's regression test (`pnpm test modules/_regression modules/payroll`) is green.
- DB is in a known state. Three acceptable starting states:
  - **Empty** (fresh `docker compose down -v && docker compose up`) — use the fast-path seed below.
  - **Post-test-suite** (`pnpm test` was just run) — equivalent to empty (`pnpm test` truncates the *test* DB now per [4bb64fa]; dev DB is untouched).
  - **Already seeded** — `pnpm db:seed:slice2-demo` is idempotent and skips when any of the 5 demo clients already exist.

## Fast path: seed the dataset

```bash
pnpm db:migrate            # if a fresh DB
pnpm db:seed-compliance    # SSS / PhilHealth / Pag-IBIG / BIR rate tables
pnpm db:seed:slice2-demo   # 5 clients · 10 detachments · 100 employees · 90 assignments
```

After the seed, the dataset matches Phase 10.2 exactly:
- 5 clients (SM Prime Holdings, Ayala Land, Robinsons Land, Megaworld Corporation, Filinvest Land), all on one shared semi-monthly payroll calendar (cutoff +2 days, payday +5 days).
- 10 detachments (2 per client, e.g. "SM Megamall", "Greenbelt 5", "Eastwood City").
- 100 employees with realistic Filipino names — codes `CG-10001`..`CG-10100`. Mix: 80 GUARD / 15 OFFICE_STAFF / 3 SUPERVISOR / 2 DRIVER. All `hired` on `2026-01-01`.
- 90 active assignments started `2026-01-15` (10 employees floating to exercise the gap UI).

If you need the slow path (manual setup, no seed) for a presentation that includes "watch how easy this is," skip to **Manual setup phase** below the 14 steps.

## The 14 steps

### 1. Log in
- Navigate to `http://localhost:3000`. Sign in with `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` from `.env` (default `admin@sentinel.local` / `admin-change-me`).
- **Expected:** redirect to `/dashboard`. Sidebar Operations section orders Dashboard → Clients → Employees → Assignments → DTR → Pay runs → Exports. The "Guards" copy is gone (Done criterion #1).

### 2. Visit Clients — 5 rows, paginated
- Sidebar → **Clients**.
- **Expected:** 5 rows in alphabetical order (Ayala Land, Filinvest Land, Megaworld Corporation, Robinsons Land, SM Prime Holdings). Header: "5 clients on file." Each row's contact email follows `payroll@<slug>.example.ph`. Pagination footer reads `Showing 1–5 of 5 clients · Rows per page [50] · Prev / Next` (Prev/Next disabled at this scale; visible to confirm pagination is wired). The page-size dropdown lets a clerk pick 25 / 50 / 100 / 200.

### 3. Visit Detachments via a client — see deployment badges
- Click into **SM Prime Holdings**.
- **Expected:** 2 detachments (`SM Megamall`, `SM Mall of Asia`), each with a deployment gauge showing `10 / 10` (green — required headcount met). Filinvest Land's two detachments will show `5 / 5`. (Done criterion #6.)

### 4. Visit Employees — 100 rows, paginated, sortable, filterable
- Sidebar → **Employees**.
- **Expected:** header reads `100 employees` (or current total). Default sort is `last_name` asc. Table shows 50 rows; footer reads `Showing 1–50 of 100 employees · page 1 of 2` with **Prev / Next** links. Click **Next** → page 2 shows the remaining 50.
- Type any letter into search → debounced result; clear it. Use the **Type** dropdown → pick `Guard` → footer should read `Showing 1–50 of 80` (page 1 of 2). Pick `Office staff` → `15 employees` (single page). Pick `Driver` → `2`. Pick `Supervisor` → `3`. (Done criterion #2 + #3.)
- Sort by **Code** desc. Top row of page 1 should be `CG-10100`.

### 5. Open one employee — verify view-mode-default + Edit toggle
- Click any row, e.g. `Cruz, Juan` if it exists (or the first row).
- **Expected:** detail page opens read-only with all fields rendered as plain text. Click **Edit** → fields become inputs. Click **Cancel** → reverts to read-only. (Done criterion #4 — also tested in Step 13.)

### 6. Visit Assignments — 90 rows, paginated, bulk-select
- Sidebar → **Assignments**.
- **Expected:** "90 active assignments" header. List paginated at 50 per page; footer reads `Showing 1–50 of 90 active assignments · page 1 of 2` with **Prev / Next** links. Click **Next** → page 2 shows rows 51–90 (last name alphabetical). The table header has a select-all checkbox + per-row checkboxes for bulk actions. (Done criterion #7.)

### 7. Bulk-transfer 5 employees as a demo
- On the assignments list, check the first 5 rows. Sticky bulk-action bar appears at the bottom.
- Click `Transfer →`. Modal opens with a typeahead for the target detachment.
- Type "Lucky" → pick `Lucky Chinatown`. Set transfer date `2026-02-01`. Confirm.
- **Expected:** modal closes; result panel briefly shows "5 transferred, 0 errors." Original 5 assignments now have end dates; 5 new assignments exist on Lucky Chinatown. Active count is still 90.

### 7b. Bulk-assign from Employees — partial-failure surface
- Sidebar → **Employees**. Filter Type=Guard. Check 2–3 rows that **already** have an active assignment (e.g. Aquino, Faith + Aquino, Rosa from the seed).
- Sticky bar shows "N selected · Assign to detachment…". Click it.
- Modal opens: title "Assign to detachment", typeahead detachment field, start date defaulted to today.
- Type "Megamall" → pick `SM Megamall`. Confirm.
- **Expected (the deliberate "partial failure" demo):** result panel reads `0 employees assigned. 2 rows failed.` with per-row plain-language reasons (`Aquino, Rosa: this guard already has an active assignment — end the previous one first`). Done dismisses, the table refreshes, selection clears. This is the contract Step 6 walk-through (multi-select + bulk-assign + named errors) — the per-row error pattern lets the clerk fix exactly what failed without re-doing the rest.
- For the happy path: pick a floating employee (one with no current active assignment — the seed leaves 10 floating) and bulk-assign them; result reads `1 employee assigned. 0 rows failed.` and the new row shows up on /assignments.

### 8. Visit DTR — countdown badge sourced from payroll calendar
- Sidebar → **DTR**. Choose a period — for the demo, use the **current** semi-monthly period (the system defaults to it). If you pick a past period like **2026-05-16 → 2026-05-31**, the badges will turn red and read "Cutoff 7 days ago" / "Payday 4 days ago" — **that's not a bug**, it's the late-DTR warning surface (Done criterion #9) telling the clerk the period is past due.
- **Expected (current period):** page header shows two amber badges: `Cutoff: <date> in N days` and `Payday: <date> in N days`. Both come from the seeded payroll calendar (Done criterion #8).
- **Expected (past period):** same badges but red, with "N days ago." This is the visible signal that this period needed to be closed already.

### 9. Quick-fill DTR for the period
- The DTR page is paginated like every other list (default 50/page, dropdown for 25 / 50 / 100 / 200). Header shows the total: "● Open · 15 days · 90 active employees". Pagination footer at the bottom: "Showing 1–50 of 90 · Prev / Next".
- DTR has no per-row select checkboxes — entry is grid-level. Click the **Mark all 90 employees as worked for this period** button. The label deliberately names the full count: the action fills every assigned employee × every day, **not just the current page**.
- **Expected:** the grid populates as green/worked across all 90 employees × N days (re-paginate to see every row turn). Banner says "Open" with a **Close period** button.
- The Slice 1 walk filled DTR for 10 guards one at a time. At Slice 2 scale, that flow is unusable; "Mark all" is the right affordance and a real clerk would use it. Per-row select + partial-fill is on the Slice-3 polish backlog.

### 10. Close period — payroll auto-runs
- Click **Close period**. Confirmation dialog → confirm.
- **Expected:** period flips to `Closed`. `dtr.period.closed` fires; the payroll subscriber creates 1 pay run per client that had DTR rows in the period (so up to 5 runs if all 10 sampled employees were spread across clients; usually fewer because the seed concentrates the first employees onto the first detachments). Pay-run cards show status `calculated` and the same cutoff/payday badges as DTR.
- If you sampled all 10 employees from one detachment, expect 1 pay run for that client only. That's still correct.

### 11. Review payslips + reconciliation
- Sidebar → **Pay runs**. Pay Runs is paginated — at the start of the demo there's at most a handful of runs. Footer reads `Showing 1–N of N pay runs`.
- Click into the most recent run. The payslips table is also paginated (default 50/page). At 100 employees with all on this run, you'll see `Showing 1–50 of 100 payslips · page 1 of 2`. The **Totals (all 100)** row at the bottom of the table aggregates over the **whole run**, not just the visible page — this is critical for filing accuracy (lock-decision is based on the run total).
- Click into any payslip row to view the per-employee payslip.
- **Expected payslip shape:** gross = `(basicSalary / WORK_DAYS_PER_MONTH) × daysWorked` + OT; four deduction lines (SSS_EE, PhilHealth_EE, Pag-IBIG_EE, BIR_WHT); net floored at ₱0. (Done criterion #12.)
- **Reconciliation bar:** the same payslip numbers reconcile within ₱1 of v2's engine — verified by `pnpm test modules/payroll/reconciliation.test.ts` (already green from Phase 10.1).
- **Lock the run** so exports are available.

### 12. Export BIR 2316 — verify the PDF is complete
- Sidebar → **Exports** → **BIR 2316** tab. Pick any employee from the locked run. Year = current year.
- **Expected:** browser downloads `bir-2316-<employeeId>-<year>.pdf`. Open it. The IVB section is fully populated (year-to-date gross / per-category deductions / net); RDO code, DOB, and address fields show **either** the employee's real values **or** plain warning text ("Missing — clerk must fill before filing") for fields that weren't set. (Done criterion #10.) The seed leaves RDO/DOB/address empty by design so this warning surface is exercised.

### 13. Fix a typo — verify audit trail
- Sidebar → **Employees**. Search "Cruz" (or any common last name from the seed). Click the first row.
- Click **Edit**. Change the **First name** to something else, then change it back. Click **Save**.
- **Expected:** save succeeds. The employee detail page shows the new (then-reverted) value. (Done criterion #4.)
- Verify the audit log via the DB:
  ```bash
  PGPASSWORD=sentinel psql -h localhost -p 5433 -U sentinel -d sentinel \
    -c "SELECT action, payload->'diff' FROM audit_log ORDER BY created_at DESC LIMIT 5;"
  ```
  At least one row should be `hr.employee.updated` with the changed-field list.

### 14. Edit a client — same edit flow
- Sidebar → **Clients** → click **SM Prime Holdings** → **Edit**.
- Change the **Contact phone** to `+63 2 8888 9999`. Save.
- **Expected:** detail page shows the new phone. Audit log gains a `clients.client.updated` row with the diff. (Done criterion #5 — same view-default + dirty-guard + audit flow as employees.)

## Done

If all 14 steps complete without coaching, the Phase 10.1 regression gate is green, and the Phase 10.4 done-sweep marks every criterion ✓ or accepted-⚠, then Slice 2 is shippable and ready to tag `slice-2-done`.

## Manual setup phase (the slow path — for stakeholder demos)

When the audience is a CGoC dept head and "watch how easy this is" is the point, skip the seed and do steps S1–S7 instead of relying on `pnpm db:seed:slice2-demo`. These map 1:1 to the Slice 2 contract's setup walk-through (lines 217–225 of [`wiki/slices/2-multi-client-at-scale.md`](../wiki/slices/2-multi-client-at-scale.md)).

- **S1.** Clients → **Add client** five times. Use `SM Prime Holdings`, `Ayala Land`, `Robinsons Land`, `Megaworld Corporation`, `Filinvest Land`. On each form, set `Default payroll calendar` → the Global Default (or create a Slice-2 Demo calendar first via the Payroll calendars admin).
- **S2.** From each client detail page → **Add detachment** twice. Set `Required headcount` to 10 for the first 4 clients, 5 for Filinvest.
- **S3.** Employees → **Import a CSV**. Use a 100-row file with mixed `employment_type` (80 GUARD, 15 OFFICE_STAFF, 3 SUPERVISOR, 2 DRIVER). Per-row errors surface inline (Slice 1's M-3 fix); all 100 import.
- **S4.** Employees → filter Type=Guard → header checkbox → **Assign to detachment**. Typeahead → "SM Megamall" → set start date → confirm. Repeat for the other detachments.
- **S5.** Detachments list → verify the deployment gauges populate as you assign.
- After S1–S5, resume the 14-step demo from Step 8 (DTR).

## When it doesn't work

| Symptom | Probable cause | Fix |
|---|---|---|
| `pnpm db:seed:slice2-demo` says "already seeded — skipping" but you wanted a fresh seed | Idempotency by design | `docker compose down -v && docker compose up -d` to wipe the volume, then `pnpm db:migrate && pnpm db:seed-compliance && pnpm db:seed:slice2-demo`. **Do not** truncate manually — wipes the seeded super-admin too. |
| Login page rejects credentials | Super-admin not seeded | `pnpm db:migrate` (migration 0001 seeds the admin if missing). |
| Employees list says "Showing first 100" but only 80 visible | Type filter still active from a prior step | Set the filter back to "All types." |
| Detachment deployment gauges all show 0 / 10 | Either the assignments seed failed or `clients.listDetachmentsWithDeployment` isn't joining active assignments | Verify `SELECT count(*) FROM assignments WHERE end_date IS NULL;` returns 90. If yes, the bug is in the join — see `modules/clients/service.ts`. |
| DTR countdown badges show plain "—" instead of a date + countdown | Selected period falls outside the seeded calendar's resolveForPeriod range, OR no calendar is set on the client whose employees are in the period | Pick a period in the current or recent month; confirm via `SELECT * FROM payroll_calendars;` that the demo calendar exists. |
| Close period click does nothing | `dtr.period.closed` subscriber not loaded in this process | Use Pay runs → **Run payroll** manually — same code path. Open a follow-up to wire the subscriber if this happens in dev. |
| BIR 2316 PDF download contains a blank IVB section | The locked run has no payslips for the year selected | Pick the year of the run you just locked in Step 11. |
| Pay-run page shows `cutoff: —` | `payroll-calendars.resolveForPeriod` returned null because the client has no `default_payroll_calendar_id` set | Open the client → Edit → set `Default payroll calendar` → Save. Re-create the pay run. |
| Audit query in Step 13 returns 0 rows | You're connected to the wrong DB (test vs dev) | Confirm with `\conninfo` in psql; the dev DB name is `sentinel`. |

## Outputs

- 5 clients, 10 detachments, 100 employees, 90 active assignments, 1 closed DTR period (10-employee sample), at least 1 locked pay run with payslips, 1 BIR 2316 PDF downloaded with the warning surface visible, 2 audited edits (1 employee, 1 client).
- Slice 2 demo passes end-to-end without opening the editor or asking the developer for help.
