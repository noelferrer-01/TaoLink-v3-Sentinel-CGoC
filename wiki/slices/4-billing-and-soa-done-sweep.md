# Slice 4 — Billing & Statements of Account — Done-criteria sweep

**Date:** 2026-06-11
**Branch:** `slice-4-billing` (off `main`)
**Result:** **9/9 done criteria pass.** Full suite green (418 tests), typecheck + lint clean, browser walk verified with screenshots.

This sweep walks every Done criterion in the [Slice 4 contract](4-billing-and-soa.md) §8 and records the evidence. If any criterion below flips from ✓ to ✗ on `main`, Slice 4 is no longer done and must be re-opened.

The slice shipped as Tasks 1–10 of the [plan](4-billing-and-soa-plan.md), each implemented + independently reviewed (spec-conformance + quality) before the next. Engine (T1–T7) and UI (T8–T9) are committed; this sweep is T10.

---

## The 9 criteria

### 1. A client can be given a billing rate + terms + VAT/EWT flags, saved and edited
**Status:** ✓
**Evidence:** UI — the **Billing & Contract** section on the client detail page ([`app/(admin)/clients/[id]/billing-section.tsx`](../../app/%28admin%29/clients/%5Bid%5D/billing-section.tsx)) + `saveBillingConfigAction` ([`actions.ts`](../../app/%28admin%29/clients/%5Bid%5D/actions.ts)). API — `billing.setClientBillingConfig` (upsert) / `getClientBillingConfig`.
**Browser-verified:** set Megaworld = ₱780 and Ayala = ₱950, both saved with a "Saved." confirmation; `billing.config.updated ×2` in `audit_log`.
**Tests:** `modules/billing/billing.test.ts` (config insert→update, audit, null-when-unset).

### 2. `Generate SOA` produces a detailed per-guard draft from the frozen assignment stamp; line math correct; subtotal/VAT/EWT/total computed (VAT/EWT marked placeholder)
**Status:** ✓
**Evidence:** `billing.generateInvoice` reads `dtr.billedDaysByEmployeeDetachment` (frozen `assignment_id`, never `getActiveAssignment`) — [`modules/billing/service.ts`](../../modules/billing/service.ts). UI — Generate control + draft SOA at [`app/(admin)/billing/[invoiceId]/page.tsx`](../../app/%28admin%29/billing/%5BinvoiceId%5D/page.tsx).
**Browser-verified:** Megaworld / May 16–31 → draft SOA, 6 guards × 16 days × ₱780 = ₱12,480 each; **Subtotal ₱74,880.00**, VAT 12% ⚑ ₱8,985.60, Less 2% EWT ⚑ −₱1,497.60, **TOTAL DUE ₱82,368.00** — all figures exact. VAT/EWT carry the ⚑ "confirm w/ CGoC" marker. Issuer header = **COMMANDER GROUP OF COMPANIES** (not SistemaHub); Due = **Jun 15** (= periodEnd May 31 + 15 terms days, timezone-safe).
**Tests:** happy-path totals, snapshots, no-pay-run + no-rate guards, regenerate-wipes-lines, local check.

### 3. A mid-period transfer splits correctly across each client's SOA
**Status:** ✓ (engine-verified; not in the demo seed)
**Evidence:** attribution is by the frozen `dtr_entries.assignment_id → detachment → client`, so a guard's days land on whichever client they were *recorded under*. Proven by the **mid-period transfer test** in `billing.test.ts` (guard who moved Client-X→Client-Y appears on X's invoice only for the X-days).
**Note (honest):** the slice-2 demo seed has **no** guard split across two clients within a single period (`SELECT … HAVING count(distinct client_id) > 1` = 0 for May 16–31), so this was **not** fabricated in the browser walk. The behaviour is covered by the engine test, not a screenshot. If a live demo of the split is wanted, craft a transfer in the seed first.

### 4. Worked days with no posting are excluded from the bill, surfaced period-level, re-attachable; never silently billed or dropped
**Status:** ✓
**Evidence:** `dtr.listUnattributedWorkedDays` (all clients, `assignment_id IS NULL`, no client filter — catches guards with zero postings all period). UI — the period-level **Unattributed worked days** panel + Re-attach ([`app/(admin)/billing/page.tsx`](../../app/%28admin%29/billing/page.tsx), [`reattach-button.tsx`](../../app/%28admin%29/billing/reattach-button.tsx)).
**Browser-verified:** crafted one unattributed day (CG-10059, Jun 1) → it appeared in the panel → **Re-attach** re-resolved the posting (`assignment_id` restored, `dtr.reattributed` audited) → panel returned to "every worked day is billable."
**Tests:** unattributed reader (incl. zero-posting guard) + reconciliation in `billing.test.ts`.

### 5. `Finalize` assigns a unique, gapless, concurrency-safe SOA number, freezes the document, refuses re-generation; `Mark paid` works only on a finalized SOA
**Status:** ✓
**Evidence:** `finalizeInvoice` allocates the number by locking/incrementing `billing_soa_counters` inside its transaction (gapless under rollback); `generateInvoice` refuses a finalized invoice; `markPaid` rejects a draft. UI gates the buttons by status ([`invoice-actions.tsx`](../../app/%28admin%29/billing/%5BinvoiceId%5D/invoice-actions.tsx)).
**Browser-verified:** Finalize → **SOA No. 2026-0001** (first of year), status → finalized, Finalize button replaced by Mark paid. Mark paid → "**Paid on Jun 11, 2026**", terminal state (only Print remains). Draft showed no Mark-paid button (gating + engine guard = defense in depth).
**Tests:** two-finalize sequence `…-0001`/`…-0002`, empty-invoice guard, already-finalized guard, draft→paid rejected.

### 6. `generateInvoice` runs the local check (billed ≤ payslip days); `reconcilePeriod` proves `Σ billed + unattributed = payslip days` per guard and flags DTR-changed-after-payroll
**Status:** ✓
**Evidence:** local check inside `generateInvoice` (per-guard billed ≤ `payslips.daysWorked`); period-wide identity in `reconcilePeriod`. (A UI surface for `reconcilePeriod` is intentionally deferred — see Deltas; the engine + tests are the contract here.)
**Tests:** split-guard reconciles (4 + 11 + payslip 15 → no mismatch), DTR-changed-after-payroll flags a mismatch, unattributed counts toward the identity.

### 7. The worked-day definition is DTR-owned and shared; payroll consumes it with zero behaviour change
**Status:** ✓
**Evidence:** `WORKED_DTR_STATUSES` now lives in [`modules/dtr/schema.ts`](../../modules/dtr/schema.ts) and is consumed by both payroll (`modules/payroll/service.ts`) and billing. The private `WORKED_STATUSES` const was removed from payroll.
**Tests:** the payroll suite is unchanged (same three statuses) and stays green; a dtr test asserts the constant holds exactly `['holiday_worked','restday_worked','worked']`.

### 8. Prior slices' demos still pass — full test + typecheck + lint green
**Status:** ✓
**Evidence:** `pnpm test` → **418 passed (25 files)** on the Docker DB (5433). `pnpm typecheck` → clean. `pnpm lint` → clean (only two pre-existing warnings in `app/layout.tsx` + `components/typeahead.tsx`, both untouched).

### 9. Browser walk (Playwright) of the §4 demo, screenshots read, incl. the unattributed panel
**Status:** ✓
**Evidence:** logged in as `admin@sentinel.local`, drove the full lifecycle, captured + **Read** 4 screenshots:
1. `t10-01-billing-empty.png` — billing landing (nav + empty states).
2. `t10-02-soa-draft.png` — the draft SOA (W4 document, all figures).
3. `t10-03-soa-paid.png` — finalized + paid SOA (2026-0001, "Paid on Jun 11, 2026").
4. `t10-04-list-and-unattributed.png` — the list (PAID pill) + the populated Unattributed panel.

The full audit trail fired: `billing.config.updated ×2`, `billing.invoice.generated`, `billing.invoice.finalized`, `billing.invoice.paid`, `dtr.reattributed`.

---

## Deltas from the plan

- **T9 client components.** The Billing UI split into a server page + three `'use client'` islands (`generate-soa.tsx`, `reattach-button.tsx`, `invoice-actions.tsx`) following the established server-action `{kind:'ok'|'error'}` pattern — pages stay server components.
- **Status-pill mapping:** draft = `is-applicant` (muted), finalized = `is-hired` (navy), paid = `is-deployed` (green). Reused existing pill classes; none invented.
- **Print:** `Print / Save PDF` calls `window.print()`; a minimal `@media print` block was added to `app/globals.css` (hides sidebar + `.no-print` chrome, strips the SOA card border). Official PDF branding/letterhead (TIN, address) is deferred (contract §7.8/§9) — the header shows "Commander Group of Companies / Security Services" with **no fabricated TIN**.
- **paidAt formatting fix:** the "Paid on …" banner runs through the page's timezone-safe `formatDate` (caught in the T9 quality review; the rest of the page already did).
- **`reconcilePeriod` has no UI in this slice.** The engine + tests exist; surfacing it as a billing-dashboard button is deferred (out of T9 scope). Not a gap — the local check inside `generateInvoice` is the in-flow guard; period reconciliation is an on-demand engine call for now.
- **Unattributed nearest-posting hint** (wireframe W3's "(near: SM Aura)") was **not** built — the reader has no such field. The panel shows code · name · date, which matches W3's actual row content.

## §7 risk dispositions

| # | Risk | Disposition |
|---|---|---|
| 7.1 (H) | Unattributed = silent revenue leak | Handled — excluded from bill, surfaced period-wide (all clients, incl. zero-posting guards), re-attachable. Browser-verified. |
| 7.2 (H) | Attribution must use frozen stamp | Handled — `generateInvoice` reads `dtr_entries.assignment_id`, never `getActiveAssignment`. |
| 7.3 (H) | Worked-day definition drift | Handled — single DTR-owned `WORKED_DTR_STATUSES`; payroll consumes it. |
| 7.4 (H) | Reconciliation period-wide not per-SOA | Handled — `generateInvoice` does only the local check; period equality lives in `reconcilePeriod`. |
| 7.5 (H) | SOA numbering gapless + concurrency-safe | Handled — locked counter row in the finalize transaction; gapless under rollback. |
| 7.6 (H) | Regenerate / finalize guards | Handled — unique `(client, period)`, draft-regenerate wipes lines, finalized immutable. |
| 7.7 (H) | Generate needs the period's payroll | Handled — no-pay-run guard blocks; `reconcilePeriod` flags changed-after. |
| 7.8 (D) | SOA-as-BIR-document? | Deferred — safe numbering built; registration rules await CGoC. |
| 7.9 (D) | Exact VAT/EWT + wage-vs-fee split | Deferred — lines are illustrative placeholders (⚑), pending CGoC. |
| 7.10 (D) | Redaction vs finalized SOA | Deferred — open policy decision; finalized lines snapshot the name. |
| 7.11 (D) | Money rounding | Deferred — exact for `days × rate`; `round2` placeholder for the deferred VAT/EWT. |
| 7.12 (D) | Per-client billing frequency | Deferred — pinned to the pay-run period until payroll goes per-client. |

## Parked / backlog (apply during a later simplify pass)

- `reattributeDtrDay` could guard against overwriting a non-null `assignment_id` (currently re-resolves regardless).
- `generateInvoice` local check is per-client; a global cross-client check is a possible add.
- `reconcilePeriod` tallies unattributed in JS — move to a SQL `GROUP BY` before ~10k-guard scale.
- A `reconcilePeriod` UI surface on the billing dashboard (deferred from T9).

## Environment note (dev DB)

Slice 4 was migrated + verified on the **Docker** Postgres (`docker-compose.yml`, host `:5433`, volume `sentinel_pgdata`). Migration `0027_slice4_billing.sql` was applied to both dev (`sentinel`) and test (`sentinel_test`) on 5433 via `pnpm db:migrate` / `pnpm db:test:setup`. The walk left the dev DB with Megaworld + Ayala billing configs and the paid SOA 2026-0001 in place (regenerable via `pnpm db:seed:slice2-demo`).
