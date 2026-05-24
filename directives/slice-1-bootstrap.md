# Directive — Slice 1 bootstrap

> SOP for the Slice 1 end-to-end demo: **bulk-import 10 guards, assign them to a detachment, enter 15-day DTR, run payroll, view payslips, export SSS R3 and BIR 2316.**
>
> Use this script for: a fresh dev verifying the slice locally, a clean demo session for a stakeholder, or the manual portion of the Phase 9.4 Done-criteria sweep.

## Inputs

- Slice 0 bootstrap already done — `localhost:3000` serving, seeded admin can log in, all smoke tests green. See [`slice-0-bootstrap.md`](slice-0-bootstrap.md) if not.
- DB is in a known state. Two acceptable starting states:
  - **Empty** (fresh `docker compose down -v && docker compose up`) — preferred for a demo.
  - **Post-test-suite** (`pnpm test` was just run) — the suite truncates tables, so this is equivalent to empty.
- Sample CSV exists at [`public/hr-employees-sample.csv`](../public/hr-employees-sample.csv) (10 rows, all `SEMI_MONTHLY`).

## The 9 steps

### 1. Log in
- Navigate to `http://localhost:3000`. Click **Log in** (or go to `/login` directly).
- Enter `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` from `.env`.
- **Expected:** redirect to `/dashboard`. Top-right shows your email. Sidebar lists: Dashboard, Employees, Clients, Assignments, DTR, Payroll, Exports.

### 2. Create 1 Client + 1 Detachment
- Sidebar → **Clients** → **New client**.
  - Name: `Commander Group of Companies` (any string works).
  - Submit.
- Click into the new client. Click **New detachment**.
  - Name: `BGC Tower 1`. Address: anything.
  - Submit.
- **Expected:** client detail page lists one detachment. URL is `/clients/<clientId>`.

### 3. Bulk-import 10 guards (with one intentionally bad row)
- Sidebar → **Employees** → **Import**.
- The screen offers a sample-CSV download link — that's `public/hr-employees-sample.csv`. Save it locally.
- To exercise the error path (Slice 1 Done criterion #3), duplicate any one row and change only the `employee_code` so the email is repeated. Example: copy line 2 and rename `CG-00001` → `CG-00011`, leaving `juan.delacruz@cgoc.local`. This row should be rejected (per v2 fix M-3 — duplicate-email precheck).
- Upload the modified CSV. Submit.
- **Expected:**
  - 10 rows imported successfully.
  - 1 row in the error panel with a plain-language message naming the duplicate email and the row number.
  - **Employees list now shows 10 active guards** (`CG-00001` through `CG-00010`).
- If you want a clean demo with no error row, upload the unmodified CSV instead — all 10 will import without errors.

### 4. Assign all 10 guards to the detachment
- Sidebar → **Assignments** → **New assignment**.
- For each of the 10 guards: select guard, select detachment `BGC Tower 1`, set `Start date` = first day of the demo period (see Step 5).
- **Expected:** assignments list shows 10 active rows, all pointing at `BGC Tower 1`, all with `Ended on` blank.
- (If a per-guard assignment screen feels long for a demo, the assignments page should support multi-select. Use whichever path the UI offers.)

### 5. Enter 15-day DTR for each guard
- Sidebar → **DTR**.
- Pick a 15-day period — pragmatic default for the demo: **first half of the current month**, i.e. day 1 → day 15.
- For each guard, use the **Quick-fill** action to mark every day in the period as `worked` with default time-in / time-out (e.g. 06:00 → 18:00). Holidays/restdays/absences are not needed for the Slice-1 demo (Slice 1 treats `holiday-worked` and `restday-worked` as regular days anyway — see contract §Components.4).
- **Expected:** DTR grid shows 10 guards × 15 days, all green/worked. Period banner at the top says `Open` and shows a **Close period** button.

### 6. Close the DTR period — payroll auto-runs
- Click **Close period**.
- **Expected behavior:**
  - DTR period flips to `Closed`.
  - `dtr.period.closed` event fires; payroll module's subscriber picks it up and triggers `payroll.runPayroll(periodStart, periodEnd)` automatically.
  - The Payroll page shows a new run with status `calculated`, containing 10 payslip rows.
- If auto-run did not fire (e.g. you're running without the event subscriber wired locally), go to **Payroll → Run payroll**, pick the closed period, click run. Same outcome.

### 7. View payslips — verify the math
- Sidebar → **Payroll** → click the new run → click into any guard's payslip.
- **Expected payslip shape:**
  - **Gross:** `(basicSalary / WORK_DAYS_PER_MONTH) × daysWorked` + simple OT. For a guard at ₱18,000 monthly basic, semi-monthly half-month, daysWorked = 13 (or whatever the period contains), no OT → gross is roughly half of monthly basic.
  - **Deductions:** four lines — SSS_EE, PhilHealth_EE, Pag-IBIG_EE, BIR_WHT — looked up from the rate tables seeded from v2.
  - **Net:** gross − sum(deductions), floored at ₱0.
- **Reconciliation check (the real bar):** for the same inputs, every line of every payslip is within ₱1 of v2's payroll engine output. This is verified by the Phase 6 Task 6.9 reconciliation test, not by squinting at numbers in the UI. If that test is green, this step passes.
- **Lock the run** for the SSS R3 export to be available. Payroll detail page → **Lock run**. Status flips `calculated → locked`. An empty run cannot be locked (per v2 fix ISSUE-C) — this run has 10 payslips, so it locks fine.

### 8. Export SSS R3
- Sidebar → **Exports** → **SSS R3** tab.
- Pick the locked payroll run from Step 7. Click **Download CSV**.
- **Expected:** browser downloads `sss-r3-<runId>.csv`. Open in Excel / Numbers / Sheets. File has 10 data rows (one per guard), columns in the SSS R3 schema (SS number, name, EE share, ER share, total, applicable month). Opens without schema errors.

### 9. Export BIR 2316 for one guard
- Same Exports screen → **BIR 2316** tab.
- Pick any guard (e.g. `CG-00001 Juan Dela Cruz`). Year = current year.
- Click **Generate**.
- **Expected:** browser downloads a 2316 form (HTML view in Slice 1, per [contract §Out of scope](../wiki/slices/1-first-payslip.md) — printable PDF deferred). Form shows the guard's identifiers (TIN, name, employer) plus the income / tax-withheld lines for the periods that exist in the current year (likely one — the one just run in Step 6–7). Partial-year by design; module README documents this.

## Done

If all 9 steps complete without coaching and the reconciliation test (Phase 6.9) and Slice 0 regression gate (Phase 9.2) are both green, the demo passes the UX bar (Slice 1 Done criterion #14) and Slice 1 is shippable.

## When it doesn't work

| Symptom | Probable cause | Fix |
|---|---|---|
| Sidebar shows no items after login | Admin layout did not mount (session not picked up) | Hard refresh. If it persists, check `auth.requireUser` in the admin layout and that the seeded user has `is_super_admin = true`. |
| CSV import returns "0 imported, 10 errors" with `duplicate email` on every row | Employees table already has these emails from a prior demo run | `pnpm test` to truncate tables, or use `wipeAllTables` helper, or pick a different email domain in the CSV. |
| Closing DTR period flips to `Closed` but no payroll run appears | Event subscriber not wired (events module not loaded in this process) | Use the manual **Run payroll** button on the Payroll page — same code path. Open a follow-up to wire the subscriber if this happens in dev. |
| Payslip numbers diverge from v2 by more than ₱1 | Rate-table seed drift, rounding mode mismatch, or a real math bug | Run `pnpm test modules/payroll/tests/reconcile-v2.test.ts` (Phase 6.9). The diff in the test output names which line in which guard's payslip. Do not eyeball — let the test localise it. |
| **Lock run** button is disabled on a run with 10 payslips | Frontend state not refreshed after `calculated` | Refresh. If still disabled, check that the run has at least one payslip row in the DB — empty runs are intentionally unlockable. |
| SSS R3 download fails with "Run is not locked" | Step 7 lock skipped | Go back to the run detail page, click **Lock run**, then retry the export. |
| BIR 2316 export errors with "no income for this year" | The chosen year doesn't contain any locked payroll runs for that employee | Pick the year of the run you just locked in Step 7. |

## Outputs

- 1 client, 1 detachment, 10 employees, 10 active assignments, 1 closed 15-day DTR period, 1 locked payroll run with 10 payslips, 1 SSS R3 CSV downloaded, 1 BIR 2316 form generated.
- Slice 1 demo passes end-to-end without opening the editor.
