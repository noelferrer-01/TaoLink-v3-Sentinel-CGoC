# Slice 4 — Billing & Statements of Account (bill the client)

**Status:** CONTRACT DRAFT (2026-06-11). Implementation pending. Brainstormed + adversarially verified against the live code (3 passes) before drafting.
**Ships:** A new `billing` module + per-client billing config + **detailed (per-guard) Statement of Account** generated from DTR + a `draft → finalized → paid` lifecycle mirroring payroll's `lockPayRun`, with an **unattributed-days guard**, **safe SOA numbering**, and a **period-level reconciliation** check against payroll.
**Demo at end:** *Set SM Aura Premier's billing rate once → run the period's payroll → click Generate SOA for SM Aura → out comes the detailed Statement (each guard × days worked at that client × rate, subtotal, placeholder VAT/EWT, total) that reconciles to the same DTR that drove payroll → finalize it and it gets a permanent SOA number. The demo also shows a mid-period transfer splitting across two clients' SOAs, and a worked day with no posting surfaced in the "unattributed — not billed" panel.*

Per [ADR 0013](../decisions/0013-vertical-slices-over-horizontal-phases.md) discipline rule #2, this README ships **before** the code. If a thing is not listed here, it is not in Slice 4.

> **Sequencing note.** [ADR 0013](../decisions/0013-vertical-slices-over-horizontal-phases.md)'s original table put *Billing* at Slice 2 and *Marketing* at Slice 4. Realized slices diverged: Slice 2 became "multi-client at scale," Slice 3 was Recruitment (+3a identity, +3b credentials). Billing is now built as **Slice 4** because it closes the money cycle (pay the guard → bill the client) and is the strongest CGoC demo. Marketing (the front-of-funnel request/SLA flow) slides to a later slice. This does not change any ADR-0013 *reasoning*, only the order.

---

## 0. Plain-language summary (for Noel)

Today Sentinel can **pay a guard** but can't **bill the client**. This slice adds the other half of the money cycle.

The key fact (from the CGoC meeting notes): a client invoice is **not** built from what we pay the guard — it's built from the **client's own contracted rate**. A guard at SM Aura is billed at SM Aura's rate no matter what that guard earns. So billing shares the *attendance* (days worked, per client) with payroll, but prices it off a **per-client rate**.

So we add: (1) a billing rate on each client, (2) a "Generate Statement of Account" button that adds up each guard's days at that client × the rate, and (3) a Statement you can review, finalize (which locks it and gives it a number), and later mark paid. It looks and behaves like the payroll runs you already have — same draft-then-lock pattern.

We deliberately keep it simple now (one blended rate per client; VAT/withholding lines are illustrative placeholders) and leave the fancy parts (per-post premiums, the exact tax treatment) for after CGoC answers a short list of questions. See [§9](#9-out-of-scope--deferred).

---

## 1. What Slice 4 buys us

Slice 1 proved one payslip reconciles to v2. Slice 2 scaled it to 100 employees / 5 clients. Slice 3 brought a person in the front door (Applied → Hired → Deployed → paid). **Slice 4 closes the loop: the same attendance that pays the guard now produces the invoice to the client.** End of slice, a CGoC clerk can set a client's rate once, run payroll, and generate a per-client Statement of Account that *provably* matches the days payroll counted — the single most credible "this is our business, automated" demo for Commander Group.

It also forces three cross-module contracts to be designed correctly: **DTR owns the definition of a worked day** (today it's mislocated in payroll), **assignment attribution is read from the frozen DTR stamp** (not re-derived), and **reconciliation is a period-wide identity** between billing and payroll. Getting these right is the point of a vertical slice.

---

## 2. The central design decisions (verified against code)

1. **Billing rate = the client's rate**, applied per guard assigned there, regardless of the guard's pay rate. (Meeting notes; `memory/domains/commander-group.md`.)
2. **Attribute each worked day to a client via the day's *frozen* posting stamp** — `dtr_entries.assignment_id`, which `recordDTR` resolves *at record time* and never re-derives. Billing reads that stamp; it does **not** call `getActiveAssignment` at billing time. Consequence: editing a guard's assignment history later can **never silently rewrite an invoice already issued**. (`modules/dtr/service.ts`, `modules/assignments/service.ts`.)
3. **One worked-day definition, owned by DTR.** The set `('worked','holiday_worked','restday_worked')` currently lives as a private const in `modules/payroll/service.ts`. Move it to `modules/dtr` (rightful owner of `dtr_status`); payroll and billing both consume it so they can never drift. (Required for §3's reconciliation identity to hold.)
4. **Lifecycle mirrors payroll.** `draft → finalized → paid` is modeled directly on `lockPayRun` (guard against re-finalize, guard against finalizing an empty invoice). One invoice per `(client, period)`; regenerating a *draft* wipes + recomputes its lines (exactly as re-running payroll wipes payslips); a *finalized* SOA is immutable.
5. **Reconciliation is period-wide, not per-SOA.** A guard split across two clients shows e.g. 4 days on Client A's SOA and 11 on Client B's; neither matches the payslip's 15 alone. The check is: for each guard in the period, `Σ(billed days across all that period's SOAs) + unattributed days = payslip.daysWorked`. Mismatch ⇒ DTR changed after payroll ran ⇒ surfaced as "re-run payroll before billing."

---

## 3. Wireframes

> ASCII = layout only. `[brackets]` = interactive behavior. **Bold** = new in Slice 4.

### W1. Client page — new **Billing & Contract** section

```
┌─ SM Aura Premier ─────────────────────────────────────────┐
│ (existing client fields … contact, payroll calendar)      │
│                                                           │
│ ── Billing & Contract ──────────────────────────────────  │  ← new section
│  Billing rate   [ ₱ 780.00 ] per guard / day worked       │
│  Payment terms  [ Net 15 ▾ ]   Invoice every [ cut-off ▾ ] │
│  ☑ Charge VAT 12%            ⚑ confirm w/ CGoC             │
│  ☑ Client withholds 2% EWT   ⚑ confirm w/ CGoC             │
│                              [ Save ]                      │
│  > One rate per client now. If armed posts cost more       │
│    later this grows into a rate table — no rebuild.        │
└───────────────────────────────────────────────────────────┘
```

### W2. Billing area — Statements of Account list

```
┌─ Statements of Account ──────────────────  [ + Generate SOA ] ┐
│ One SOA per client per period. Generate pulls live from DTR.  │
│                                                               │
│ SOA No.    Client            Period        Total      Status  │
│ 2026-0512  SM Aura Premier   May 16–31    ₱61,776     Draft   │ [row → detail]
│ 2026-0511  BDO Ortigas       May 16–31    ₱48,200     Finalized
│ 2026-0488  SM Aura Premier   May 1–15     ₱59,904     Paid    │
└───────────────────────────────────────────────────────────────┘
```

### W3. Generate SOA — picker + **unattributed-days guard**

```
┌─ Generate Statement of Account ───────────────────────────┐
│ Client  [ SM Aura Premier ▾ ]   Period [ May 16–31 2026 ▾ ]│  ← period = a pay-run period
│ [ Generate ]                                              │
│                                                           │
│ ⚠ 2 worked days have no posting and were NOT billed:      │  ← only if any exist
│    CG-10044 Reyes, P. — May 16                            │
│    CG-10051 Cruz, A.  — May 23                            │
│    [ Re-attach to a posting ]  ← re-resolves the DTR day  │
└───────────────────────────────────────────────────────────┘
```

### W4. The Statement of Account (detailed — per guard) — printable detail

```
┌───────────────────────────────────────────────────────────┐
│ COMMANDER GROUP OF COMPANIES        STATEMENT OF ACCOUNT   │
│ Security Services · TIN … · Quezon City                   │
│ BILL TO: SM Aura Premier              SOA No. 2026-0512    │
│                                       Period May 16–31     │
│                                       Due   Jun 15, 2026   │
│ ─────────────────────────────────────────────────────────  │
│ Guard                 Post           Days  Rate   Amount   │
│ CG-10001 Dela Cruz,J. Main Entrance   15   780   11,700    │
│ CG-10002 Santos, M.   Main Entrance   15   780   11,700    │
│ CG-10044 Reyes, P.    Main Entrance   12   780    9,360    │
│ CG-10071 Aquino, J.   Parking         15   780   11,700    │
│ CG-10072 Bautista, R. Parking         15   780   11,700    │
│ ─────────────────────────────────────────────────────────  │
│            Subtotal (72 man-days)              56,160.00   │
│            VAT 12%            ⚑ placeholder      6,739.20   │
│            Less 2% EWT        ⚑ placeholder     (1,123.20)  │
│            TOTAL DUE                          ₱61,776.00   │
└───────────────────────────────────────────────────────────┘
```

> Line grain = **(guard, detachment)**. A guard who worked two posts of the same client gets two lines. Summary-by-post view is a deferred rollup (§9).

---

## 4. UX walk-through (clerk's eyes, written before code)

1. Clerk opens **SM Aura Premier**, scrolls to **Billing & Contract**, types `780` into Billing rate, leaves VAT/EWT on (with the ⚑ note that the real treatment is pending), clicks **Save**.
2. Payroll for **May 16–31** has already been run + locked the usual way (Slice 1/2 flow).
3. Clerk opens **Statements of Account**, clicks **Generate SOA**, picks SM Aura + the May 16–31 period, clicks **Generate**.
4. If any of SM Aura's guards have worked days with no posting, a **⚠ unattributed** panel lists them by guard + date and they are **excluded from the bill** (not silently dropped). Clerk can **Re-attach** a day to a posting and regenerate. *(If a step needs a field the Components section lacks, the schema is wrong, not this walk.)*
5. A **draft** SOA appears (W4). Clerk eyeballs it — the per-guard days match the DTR they entered. A guard transferred mid-period to BDO only shows their SM Aura days here; their BDO days are on BDO's own SOA.
6. Clerk clicks **Finalize**. The SOA gets number `2026-0512`, the numbers freeze, status → **Finalized**. Re-generating is now refused.
7. Later, on payment, clerk opens the SOA and clicks **Mark paid** → status **Paid**.
8. (Behind the scenes) generating ran the **period reconciliation**: every guard's billed-days-across-all-SOAs + unattributed = their payslip days. Had DTR been edited after payroll, the clerk would have seen a "re-run payroll first" warning.

---

## 5. Components (per-module additions)

### 5a. `modules/billing/` — **NEW MODULE** (standard module contract)

**Schema** (`modules/billing/schema.ts`, migration `0027_slice4_billing.sql`):

- `client_billing_config` — `id`, `clientId` (FK clients, unique), `ratePerManday` numeric(12,2), `paymentTermsDays` int default 15, `chargesVat` bool default true, `clientWithholdsEwt` bool default true, `createdAt`, `updatedAt`. *(Billing owns this table — it does not add columns to the clients module's table.)*
- `billing_invoices` — `id`, `clientId` (FK), `periodStart` date, `periodEnd` date, `soaNumber` text **nullable until finalized** (unique when set), `status` enum `billing_invoice_status` `('draft','finalized','paid')` default draft, `subtotal`/`vatAmount`/`ewtAmount`/`totalDue` numeric(12,2), `generatedAt`/`finalizedAt`/`paidAt` timestamptz nullable, `createdAt`. **Unique `(clientId, periodStart, periodEnd)`** (one invoice per client per period).
- `billing_invoice_lines` — `id`, `invoiceId` (FK, on delete cascade), `employeeId` (FK), `employeeCodeSnapshot` text, `employeeNameSnapshot` text *(snapshot on finalize for document stability; see §7 redaction risk)*, `detachmentId` (FK), `detachmentNameSnapshot` text, `daysWorked` int, `ratePerManday` numeric(12,2) **snapshot**, `amount` numeric(12,2). Numeric values stored as strings per Drizzle's contract.

**Public API** (`modules/billing/index.ts`):

| Function | What it does |
|---|---|
| `setClientBillingConfig(input)` | Upsert a client's rate/terms/VAT/EWT flags. Audits `billing.config.updated`. |
| `previewUnattributed(clientId, period)` | Returns worked days for the client's guards in the period whose DTR row has `assignment_id IS NULL` (guard+date list). |
| `generateInvoice(clientId, period, { actorUserId })` | Draft-upsert one invoice for `(client, period)`; wipe+recompute lines from DTR via the **frozen** `assignment_id → detachment → client`; group by (employee, detachment); `days × rate = amount`; compute subtotal + placeholder VAT/EWT/total; run period reconciliation; audit `billing.invoice.generated`. Refuses if the invoice is already finalized. |
| `finalizeInvoice(invoiceId, { actorUserId })` | Mirrors `lockPayRun`: guard already-finalized, guard empty-invoice; assign `soaNumber` via a **concurrency-safe sequence**; snapshot line display fields; freeze; audit `billing.invoice.finalized`. |
| `markPaid(invoiceId, { actorUserId })` | draft/finalized → paid; audit `billing.invoice.paid`. |
| `reconcilePeriod(period)` | Period-wide check: per guard, `Σ billed days + unattributed = payslip.daysWorked`; returns mismatches. |
| `listInvoices(filter)` / `getInvoiceWithLines(id)` | Reads for the UI. |

**Dependencies:** `dtr` (worked-day def + per-(employee,detachment) day reader off frozen `assignment_id`), `assignments`/`clients` (detachment→client join), `hr`+`persons` (guard code/name via join at draft), `payroll` (payslip day-count for reconciliation), `audit`, `events`. No module imports `billing` (leaf).

**Events:** publishes `billing.invoice.generated|finalized|paid`. (No subscriptions in this slice — generation is manual.)

### 5b. `modules/dtr` — own the worked-day definition + a re-attribution path

- Export the worked-day status set (e.g. `WORKED_DTR_STATUSES` / `countsAsWorkedDay`) from the module's public surface.
- Add a **per-(employee, detachment) worked-day reader** for a period that reads the frozen `assignment_id` (the billing line source) + an **unattributed reader** (worked days with `assignment_id IS NULL`).
- Add `reattributeDtrDay(dtrEntryId, { actorUserId })` (minimal): re-resolve the active assignment for that row's date and stamp it, so a day recorded before the posting existed isn't stuck unbillable. Audits `dtr.reattributed`. *(Bulk re-attribution deferred.)*

### 5c. `modules/payroll` — consume the shared worked-day definition

- Replace the private `WORKED_STATUSES` const with the `dtr`-owned one. **Behavior-identical** (same set) — payroll's existing tests must stay green. No other payroll change.

### 5d. App (`app/(admin)/`)

- `billing/` — Statements list (`page.tsx`), Generate flow + unattributed panel, SOA detail/print view, `actions.ts` (`'use server'`, pass `actorUserId` from session).
- Client page — add the **Billing & Contract** section + save action.
- Sidebar — add **Billing** nav entry.

---

## 6. Cross-module contracts

| Caller | Callee | Contract |
|---|---|---|
| `billing.generateInvoice` | `dtr` (reader) | Worked days per (employee, detachment) in period, via **frozen** `assignment_id`. Never re-resolves assignment. |
| `billing.generateInvoice` | `dtr` worked-day def | Same status set payroll counts (shared, DTR-owned). |
| `billing.reconcilePeriod` | `payroll.listPayslipsWithEmployee` | Per-guard `daysWorked` snapshot for the period's pay run. |
| `billing` lines | `clients`/`assignments` | `detachment_id → client_id` resolves the SOA's client + post label. |
| `payroll` | `dtr` worked-day def | Refactored to consume the shared definition (no behavior change). |
| `billing` config table | `clients` | FK only — billing owns its own config table; does not mutate the clients schema. |

---

## 7. Risks, edge cases & review targets

> This section exists so the code review has a concrete checklist to *break*. Each item is either handled in-scope (H), or an accepted/deferred risk (D).

1. **(H) Unattributed worked days = silent revenue leak.** A worked day with `assignment_id IS NULL` (training/HQ, or attendance recorded *before* the posting was created) can't be billed. Handling: surfaced on generate, excluded from the bill (not dropped), re-attachable via §5b. Review target: confirm they're never silently billed to the wrong client nor dropped without surfacing.
2. **(H) Attribution must use the frozen stamp, not a live lookup.** Re-deriving the client at billing time would let later assignment edits rewrite issued invoices. Review target: confirm `generateInvoice` reads `dtr_entries.assignment_id`, never calls `getActiveAssignment`.
3. **(H) Worked-day definition drift.** If billing and payroll disagree on what counts as a worked day, the reconciliation identity breaks. Review target: confirm a single shared definition (DTR-owned) and that payroll still uses it.
4. **(H) Reconciliation is period-wide, not per-SOA.** Review target: a guard split across two clients reconciles only across *all* the period's SOAs + unattributed; confirm the check isn't applied per-invoice (which would false-alarm on every split guard).
5. **(H) SOA numbering must be concurrency-safe + gapless.** Naive `max(soaNumber)+1` races under concurrent finalize. Review target: numbering uses a DB sequence / locked counter; two finalizes can't collide or skip.
6. **(H) Regenerate / finalize guards.** One invoice per (client, period); regenerating a draft wipes+recomputes; a finalized SOA can't be regenerated or edited. Review target: confirm the unique constraint + the finalized-immutability guard, modeled on `lockPayRun`.
7. **(H) DTR edited after payroll lock.** Generating after DTR changed (vs. the locked payslip snapshot) must warn "re-run payroll," not silently emit a divergent bill. Review target: `reconcilePeriod` flags the mismatch.
8. **(D) SOA-as-BIR-document?** Whether the Statement is an official BIR-registered series (strict gapless/ATP rules) or an internal statement preceding the official receipt — **CGoC question**. We build safe numbering regardless; the registration rules are out of scope until answered.
9. **(D) Exact VAT/EWT + wage-vs-fee split.** PH security agencies often bill *wages at cost + agency fee*, with VAT/EWT on the fee only. The MVP's single blended rate can't express that, so the tax lines are **illustrative placeholders**. If CGoC's real model is wage+fee, the rate *setup* grows (one field → wage+fee) but the SOA shape (guard × days × rate × amount) is unchanged — **CGoC question**.
10. **(D) Redaction vs. a finalized SOA.** A finalized invoice snapshots guard name for document stability — which retains PII after a person is redacted; conversely a live join would mutate a "locked" document. BIR record-retention (commonly 10 yr) may legally override erasure. Flagged open policy decision; not resolved here. See [[project_audit_log_immutable_pii_convention]].
11. **(D) Money rounding.** Real money on the SOA is `integer days × 2-decimal rate` = exact; only the deferred VAT/EWT percentages need a rounding rule, which arrives with the deferred tax treatment. No shared money helper exists today; if VAT/EWT lands, add one rather than scattering `.toFixed`.
12. **(D) Per-client billing frequency.** Payroll runs one global period (no per-client run yet), so billing pins its period to the pay run. Truly per-client billing cycles are deferred until payroll itself is per-client.

---

## 8. Done criteria (slice is done iff *all* true)

1. A client can be given a billing rate + terms + VAT/EWT flags, saved and edited, via the client page.
2. `Generate SOA` produces a detailed, per-guard draft from DTR using the **frozen** assignment stamp; days × rate × line amounts are correct; subtotal/VAT/EWT/total computed (VAT/EWT clearly marked placeholder).
3. A mid-period transfer splits correctly: the guard's days appear on each client's SOA per the posting they were recorded under.
4. Worked days with no posting are surfaced in the unattributed panel, excluded from the bill, and re-attachable; they are never silently billed or dropped.
5. `Finalize` assigns a unique, gapless, concurrency-safe SOA number, freezes the document, and refuses re-generation; `Mark paid` works.
6. `reconcilePeriod` proves `Σ billed + unattributed = payslip days` per guard, and flags DTR-changed-after-payroll.
7. The worked-day definition is DTR-owned and shared; payroll consumes it with **zero behavior change** (payroll suite green).
8. **Prior slices' demos still pass** — full `pnpm test` + `typecheck` + `lint` green; Slice 1/2/3 golden paths untouched.
9. Browser walk (Playwright) of the §4 demo, screenshots read, incl. the transfer split + unattributed panel.

---

## 9. Out of scope / deferred (do not creep)

| Deferred | Lives in |
|---|---|
| Per-post / armed-vs-unarmed rates; full per-client OT/NSD/Saturday/emergency **rate stack** | later "rate-stack" slice |
| Exact VAT / 2% EWT treatment + wage-pass-through vs agency-fee rate model | after CGoC answers (§7.9) |
| Summary-by-post SOA view (cheap rollup over the same lines) | later |
| "Sent to client" status; payment **aging**, partial payments, credit notes/adjustments | later |
| Per-client billing **frequency** / calendars | after payroll goes per-client |
| Final SOA **PDF branding** / official format | after CGoC sample (§7.8) |
| **RBAC** (admin-only for now, consistent with the whole app) | app-wide RBAC slice |
| Redaction policy for guard names on historical financial SOAs | open policy decision (§7.10) |
| Bulk re-attribution of unattributed DTR days | later (single-day re-attach ships) |

---

## 10. Open questions resolved during drafting

- **Build now vs wait for CGoC?** Build now, defer the fancy parts (Noel, 2026-06-11). The contract↔invoice↔DTR-split *shape* is well-grounded in the meeting notes; the unknowns (premium structure, tax) are isolated to the rate-config + tax-line layers.
- **SOA detail level?** Detailed (per-guard). Rationale: the figures are per-guard regardless; detail is the source data, summary is a cheap rollup; you can aggregate up but never disaggregate down (Noel, 2026-06-11).
- **Where does the worked-day definition live?** DTR (owner of `dtr_status`), not payroll — corrected during adversarial review.
- **Does billing re-derive the client?** No — frozen DTR stamp, for invoice stability.

---

## 11. CGoC questions raised by this slice (for Noel's next client conversation)

1. How is a client priced — per guard/day (man-day)? per month? Different for armed vs unarmed posts?
2. Do you add VAT (12%)? Does the client withhold 2% EWT? Shown as lines, and on the **agency fee** only or the whole amount?
3. Is the Statement of Account an **official BIR-registered document** (numbered series) or an internal statement before the official receipt?
4. How often do you invoice, and is it aligned to the payroll cut-off?
5. Can you share **one real SOA** so we can match the format?

(Parallels the existing parked Commander asks: gov-ID arrival timing + authoritative armed/unarmed posting source.)
