# modules/billing

## Purpose

Prices each guard's DTR-worked days at the client's contracted man-day rate into a per-client Statement of Account (SOA) that follows a `draft → finalized → paid` lifecycle, producing the billable side of the money cycle that payroll's guard-pay side already closes.

## Public API

Import from `@/modules/billing` only — never reach into `service.ts` or `schema.ts` from outside this module.

```ts
import { billing, type BillingInvoice, type BillingInvoiceLine, type BillingInvoiceWithLines, type ClientBillingConfig, type ReconcileMismatch } from '@/modules/billing';
```

### Functions

| Function | Signature | What it does |
|---|---|---|
| `setClientBillingConfig` | `(input: SetClientBillingConfigInput) => Promise<ClientBillingConfig>` | Upsert a client's billing rate, payment terms, and VAT/EWT flags. Returns the persisted config row. Audits `billing.config.updated`. |
| `getClientBillingConfig` | `(clientId: string) => Promise<ClientBillingConfig \| null>` | Fetch the billing config for a client, or `null` if none has been set. |
| `generateInvoice` | `(clientId: string, period: { start: string; end: string }, opts?: { actorUserId?: string \| null }) => Promise<BillingInvoiceWithLines>` | Draft-upsert one invoice for `(client, period)`. Reads worked days from the frozen DTR assignment stamp, prices each (guard, detachment) row at the client's rate, computes subtotal + placeholder VAT/EWT/total, runs a local sanity check (billed ≤ payslip days per guard), re-wipes lines on regenerate. Audits `billing.invoice.generated`. Emits `billing.invoice.generated` event. Throws if no pay run exists for the period or no billing rate is configured. |
| `getInvoiceWithLines` | `(invoiceId: string) => Promise<BillingInvoiceWithLines \| null>` | Return an invoice with its line rows ordered by `employeeCodeSnapshot` ASC, or `null` if not found. |
| `finalizeInvoice` | `(invoiceId: string, opts?: { actorUserId?: string \| null }) => Promise<BillingInvoice>` | Assign a gapless concurrency-safe SOA number (`YYYY-NNNN`), flip status to `finalized`, and freeze the document — all in one transaction. Throws if the invoice is already finalized or has no lines. Audits `billing.invoice.finalized`. |
| `markPaid` | `(invoiceId: string, opts?: { actorUserId?: string \| null }) => Promise<BillingInvoice>` | Flip a finalized invoice to `paid`. Rejects draft invoices — callers must finalize first. Audits `billing.invoice.paid`. |
| `reconcilePeriod` | `(period: { start: string; end: string }) => Promise<ReconcileMismatch[]>` | Period-wide billing↔payroll identity check: for each guard paid in the period, `Σ billed days (all SOAs) + unattributed days = payslip.daysWorked`. Returns only mismatching rows; returns `[]` when no pay run exists. |
| `listUnattributedWorkedDays` | `(period: { start: string; end: string }) => Promise<Array<{ dtrEntryId, employeeId, employeeCode, firstName, lastName, date }>>` | Period-level, all clients: every worked DTR row whose `assignment_id IS NULL` — includes guards with no posting the entire period (a per-client view would miss these). Delegates to `dtr.listUnattributedWorkedDays` (the row type is dtr's `UnattributedDay`). |
| `listInvoices` | `(filter?: { clientId?: string; status?: 'draft' \| 'finalized' \| 'paid' }) => Promise<BillingInvoice[]>` | Return invoices, optionally filtered, ordered newest period first. |

### Types

| Type | What it is |
|---|---|
| `ClientBillingConfig` | `$inferSelect` from `client_billing_config` — rate, terms, VAT/EWT flags. |
| `BillingInvoice` | `$inferSelect` from `billing_invoices` — header: clientId, period, soaNumber, status, totals, timestamps. |
| `BillingInvoiceLine` | `$inferSelect` from `billing_invoice_lines` — one (guard, detachment) row: snapshots, daysWorked, rate, amount. |
| `BillingInvoiceWithLines` | `BillingInvoice & { lines: BillingInvoiceLine[] }` — invoice + all its lines. |
| `ReconcileMismatch` | `{ employeeId, employeeCode, billed, unattributed, payslipDays }` — one guard whose period totals don't balance. |

## Dependencies

### Modules consumed

| Module | What billing uses |
|---|---|
| `@/modules/dtr` | `billedDaysByEmployeeDetachment` — worked days per (employee, detachment) via the frozen `assignment_id` stamp; `listUnattributedWorkedDays` — worked days with no assignment; both live in the DTR module as the single source of the worked-day definition. |
| `@/modules/payroll` (schema) | `payRuns` + `payslips` — the period's pay run and per-guard `daysWorked` snapshot (used in the local check inside `generateInvoice` and in `reconcilePeriod`). |
| `@/modules/hr` (schema) | `employees.employeeCode` — fetched in `reconcilePeriod` to populate mismatch rows. Guard names/codes in invoice lines are joined at generate time (via the dtr reader) and snapshotted. |
| `@/modules/audit` | `audit.record` on every mutation. |
| `@/modules/events` | `events.publish` on `billing.invoice.generated`. |
| `@/core/db` | `getDb()` — all DB access. |

### Tables owned

| Table | Purpose |
|---|---|
| `client_billing_config` | One row per client: man-day rate, payment terms, VAT/EWT flags. |
| `billing_invoices` | Invoice header per `(clientId, periodStart, periodEnd)`. Unique constraint enforces one SOA per client per period. `soaNumber` is null until finalized. |
| `billing_invoice_lines` | One row per (guard, detachment) in the period. Cascades delete with the invoice. |
| `billing_soa_counters` | Gapless SOA sequence: one row per year, incremented inside the `finalizeInvoice` transaction to prevent gaps and races. |

### Migration

`drizzle/migrations/0027_slice4_billing.sql` — creates all four tables, the `billing_invoice_status` enum, and the client-period unique + index.

## Known failure modes

### "No pay run for this period — run payroll first"
**Trigger:** `generateInvoice` called before payroll has been run for the period (`pay_runs` has no row matching `periodStart`/`periodEnd`). The local sanity check has no payslip snapshot to compare against.
**Fix:** run and lock payroll for the period first, then generate the SOA.

### "Set a billing rate for this client first"
**Trigger:** `generateInvoice` called for a client with no row in `client_billing_config`.
**Fix:** call `setClientBillingConfig` for that client before generating.

### "Invoice already finalized — cannot regenerate"
**Trigger:** `generateInvoice` called on a client/period where the invoice is already `finalized` or `paid`. Finalized SOAs are immutable.
**Fix:** do not regenerate a finalized invoice. If the underlying DTR changed after finalize, the `reconcilePeriod` check will surface the drift — but the locked SOA is the issued document and cannot be rewritten.

### "Invoice has no lines — generate it first"
**Trigger:** `finalizeInvoice` called on an invoice with zero `billing_invoice_lines` rows (e.g. the period had no worked days attributed to this client).
**Fix:** confirm there are DTR worked-day rows with `assignment_id` pointing to this client's detachments for the period, then regenerate.

### "Finalize the invoice before marking it paid"  (draft → paid rejected)
**Trigger:** `markPaid` called on a draft invoice. The lifecycle enforces `draft → finalized → paid`; skipping finalize is refused.
**Fix:** call `finalizeInvoice` first (which assigns the SOA number), then `markPaid`.
**Related:** calling `markPaid` on an **already-paid** invoice throws `[billing/markPaid] this invoice is already marked paid` (distinct from the draft case). Likewise `finalizeInvoice` on a non-draft throws `invoice is already <status> — only a draft can be finalized`, so a `paid` invoice reports "already paid", not "already finalized".

### "Billed days exceeds payroll for a guard"
**Trigger:** `generateInvoice` local sanity check fires — a guard's total billed days at this client exceed their `payslips.daysWorked` for the period. Indicates DTR has been edited after payroll ran or a data integrity issue.
**Fix:** re-run payroll for the period to sync the payslip snapshot to the current DTR, then regenerate the SOA.

### SOA number gap or collision (shouldn't happen)
**Expected behaviour:** `finalizeInvoice` increments `billing_soa_counters.next_value` inside its transaction, so the counter row is locked until commit. Concurrent finalizes queue; a rollback returns the counter to its previous value. The sequence is gapless.
**If a gap or duplicate is observed:** inspect `billing_soa_counters` for unexpected `next_value`. A gap means a transaction incremented the counter and then rolled back for a non-counter reason — the gapless invariant should hold if all finalize paths go through `finalizeInvoice`. A duplicate would indicate two finalizes racing outside the transaction, which the design prevents. File a DB investigation; do not manually patch `soaNumber`.

### Reconciliation mismatch (`reconcilePeriod` returns rows)
**Meaning:** for at least one guard, `Σ billed days across all period SOAs + unattributed days ≠ payslip.daysWorked`. The DTR changed after payroll ran (a worked day was added, removed, or re-attributed).
**Fix:** correct the DTR entry, re-run payroll to regenerate the payslip snapshot, regenerate any draft SOAs, then re-run `reconcilePeriod`. Finalized SOAs cannot be regenerated (see above).

### VAT / EWT lines are placeholder treatments
Both the 12% VAT and 2% EWT amounts are computed as simple percentages of the subtotal — this is a placeholder pending CGoC's confirmation of the actual billing model (contract §7.9). If the real model separates agency fee from wage pass-through (with VAT/EWT only on the fee), the rate configuration will need to grow to express that split. The SOA line shape (guard × days × rate × amount) is unchanged by that decision; only the tax computation layer changes. See `wiki/slices/4-billing-and-soa.md` §7.9 and §9.

### Period-wide reconciliation identity
`reconcilePeriod` checks: for each guard in the period, `Σ billed days (across ALL that period's SOAs) + unattributed days = payslip.daysWorked`. A guard split across two clients contributes to two SOAs; neither SOA alone balances against the payslip — only the period-wide sum does. Do not run `reconcilePeriod` on a partial set of SOAs; run it after all that period's SOAs have been generated.

## App surface

The clerk-facing UI lives outside this module at `app/(admin)/billing/`:
- `page.tsx` — Statements list + Generate control + period-level Unattributed panel (Re-attach).
- `[invoiceId]/page.tsx` — the printable per-guard SOA (issuer = **Commander Group**, not SistemaHub; Due = `periodEnd + paymentTermsDays`), with status-gated **Finalize** (draft only) / **Mark paid** (finalized only) / **Print** buttons.
- `actions.ts` — `'use server'` wrappers that pass `actorUserId` from the session and surface module errors as plain-language inline messages.

Verified end-to-end in a browser walk (Slice 4 T10): set rate → Generate → draft SOA → Finalize (gapless `2026-0001`) → Mark paid → Unattributed surface + Re-attach. See the done-sweep below. Print/Save-PDF uses the browser's `window.print()` with a minimal `@media print` rule in `app/globals.css`; official PDF branding is deferred (contract §7.8/§9).

---

Cross-references: [`wiki/slices/4-billing-and-soa.md`](../../wiki/slices/4-billing-and-soa.md) (contract + wireframes + design decisions), [`wiki/slices/4-billing-and-soa-plan.md`](../../wiki/slices/4-billing-and-soa-plan.md) (implementation plan), [`wiki/slices/4-billing-and-soa-done-sweep.md`](../../wiki/slices/4-billing-and-soa-done-sweep.md) (verification + deltas).
