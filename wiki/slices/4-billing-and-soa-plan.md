# Slice 4 — Billing & Statements of Account — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Contract:** [4-billing-and-soa.md](4-billing-and-soa.md) — read it first. This plan implements that contract; section refs below (§5a etc.) point into it.
> **Prerequisite:** Slices 1–3 merged. Branch `slice-4-billing` (off `main`). Migrations at `0026`; this slice adds `0027`.

**Goal:** Add a `billing` module that prices each guard's DTR days at the client's contracted rate into a detailed, per-guard Statement of Account, with a `draft → finalized → paid` lifecycle, period-level unattributed-days guard, safe SOA numbering, and period reconciliation against payroll.

**Architecture:** Billing reads each worked day's **frozen** `dtr_entries.assignment_id → detachment → client` (never re-derives), counts man-days per `(employee, detachment)` for a client+period, multiplies by the client's `ratePerManday`. Lifecycle mirrors payroll's `pay_runs` (`runPayroll`/`lockPayRun`). The "what counts as a worked day" rule moves from payroll into its owner, `dtr`, and both consume it. See contract §2.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle ORM + Postgres, Vitest. Numeric columns stored as strings (Drizzle contract). Hand-written SQL migrations per [reference_migration_workflow]. Module conventions per [AGENTS.md](../../AGENTS.md): one public `index.ts`, `actorUserId?` on mutations, `audit.record` + `events.publish`, errors prefixed `[billing/fn]`, **no PII in audit payloads** ([project_audit_log_immutable_pii_convention]).

> **Conventions confirmed against shipped code (do not re-litigate):**
> 1. `dtr_entries.assignment_id` is **nullable** and **frozen at record time** (`recordDTR` resolves `getActiveAssignment` once). Bill off that stored value; never call `getActiveAssignment` in billing.
> 2. Worked-day set = `('worked','holiday_worked','restday_worked')`, today a private const in `modules/payroll/service.ts:38`. Task 1 relocates it to `dtr`.
> 3. `pay_runs` are **global per (periodStart, periodEnd)** (no clientId). Billing period = a pay-run period. `payslips.daysWorked` is the per-guard worked-day snapshot used for reconciliation.
> 4. `unique (employeeId, date)` on `dtr_entries` ⇒ one entry → one assignment → one client per guard per day (no double-billing a day).

---

### Task 1: Relocate the worked-day definition to `dtr`; payroll consumes it

**Files:** Modify `modules/dtr/schema.ts`, `modules/dtr/index.ts`, `modules/payroll/service.ts`; Test `modules/dtr/dtr.test.ts`, run `modules/payroll/payroll.test.ts`.

- [ ] **Step 1: Failing test** (`dtr.test.ts`) — assert the shared constant exists and holds exactly the three worked statuses:
```ts
import { WORKED_DTR_STATUSES } from '@/modules/dtr';
it('WORKED_DTR_STATUSES is the canonical worked-day set', () => {
  expect([...WORKED_DTR_STATUSES].sort()).toEqual(['holiday_worked', 'restday_worked', 'worked']);
});
```
- [ ] **Step 2: Run → fail** (`pnpm test -- dtr` → not exported).
- [ ] **Step 3: Implement** — in `modules/dtr/schema.ts`, below the `dtrStatus` enum, add and export:
```ts
// The dtr_status values that count as a worked (billable / payable) day.
// Owned here because dtr owns dtr_status; payroll and billing both consume it
// so the definition can never drift between what's paid and what's billed.
export const WORKED_DTR_STATUSES = ['worked', 'holiday_worked', 'restday_worked'] as const satisfies ReadonlyArray<DtrEntry['status']>;
```
Re-export it from `modules/dtr/index.ts` (add to both the `dtr` object and the named exports).
- [ ] **Step 4: Refactor payroll** — in `modules/payroll/service.ts`, delete the private `WORKED_STATUSES` const (line 38) and `import { WORKED_DTR_STATUSES } from '@/modules/dtr'`; replace the one usage (line ~105) `(WORKED_STATUSES as readonly string[]).includes(e.status)` → `(WORKED_DTR_STATUSES as readonly string[]).includes(e.status)`. **No behavior change.**
- [ ] **Step 5: Run → pass** — `pnpm test -- dtr payroll` green (payroll suite must be unchanged); `pnpm typecheck`.
- [ ] **Step 6: Commit** — `refactor(dtr): own the worked-day status set; payroll consumes it`

---

### Task 2: DTR billing readers + single-day re-attribution

**Files:** Modify `modules/dtr/service.ts`, `modules/dtr/index.ts`; Test `modules/dtr/dtr.test.ts`.

Three private→public reads/actions billing needs. All read the **frozen** `assignment_id`.

- [ ] **Step 1: Failing tests** (`dtr.test.ts`), using fixtures with: guard A worked 4 days at a Client-X detachment then transferred (DTR rows stamped accordingly), guard B with 2 worked days whose `assignment_id IS NULL`:
  - `billedDaysByEmployeeDetachment('client-x', period)` returns `[{ employeeId, employeeCode, firstName, lastName, detachmentId, detachmentName, days: 4 }]` for A; excludes B's null-assignment days; excludes non-worked statuses.
  - `listUnattributedWorkedDays(period)` returns B's 2 rows `{ dtrEntryId, employeeId, employeeCode, firstName, lastName, date }`, across **all** clients (no client filter), including a guard whose every day is unattributed.
  - `reattributeDtrDay(dtrEntryId)` on one of B's rows, after B has an active assignment covering that date, sets `assignment_id` and audits `dtr.reattributed`; the row now appears under its client in `billedDaysByEmployeeDetachment`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** in `modules/dtr/service.ts`:
```ts
import { WORKED_DTR_STATUSES } from './schema';
import { assignments } from '@/modules/assignments/schema';
import { detachments } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';
import { persons } from '@/modules/persons/schema';

export type BilledDays = { employeeId: string; employeeCode: string; firstName: string; lastName: string; detachmentId: string; detachmentName: string; days: number };

// Worked man-days per (employee, detachment) for ONE client in [start,end],
// attributed by the FROZEN dtr_entries.assignment_id. No getActiveAssignment.
export async function billedDaysByEmployeeDetachment(clientId: string, start: string, end: string): Promise<BilledDays[]> {
  return getDb().select({
      employeeId: employees.id, employeeCode: employees.employeeCode,
      firstName: persons.firstName, lastName: persons.lastName,
      detachmentId: detachments.id, detachmentName: detachments.name,
      days: sql<number>`COUNT(*)::int`,
    })
    .from(dtrEntries)
    .innerJoin(assignments, eq(assignments.id, dtrEntries.assignmentId))
    .innerJoin(detachments, eq(detachments.id, assignments.detachmentId))
    .innerJoin(employees, eq(employees.id, dtrEntries.employeeId))
    .innerJoin(persons, eq(persons.id, employees.personId))
    .where(and(
      eq(detachments.clientId, clientId),
      between(dtrEntries.date, start, end),
      inArray(dtrEntries.status, [...WORKED_DTR_STATUSES]),
    ))
    .groupBy(employees.id, employees.employeeCode, persons.firstName, persons.lastName, detachments.id, detachments.name);
}

export type UnattributedDay = { dtrEntryId: string; employeeId: string; employeeCode: string; firstName: string; lastName: string; date: string };

// Period-level, ALL clients: worked days with NO posting (assignment_id IS NULL).
// Unbillable until re-attached. Catches guards with zero postings all period.
export async function listUnattributedWorkedDays(start: string, end: string): Promise<UnattributedDay[]> {
  return getDb().select({
      dtrEntryId: dtrEntries.id, employeeId: employees.id, employeeCode: employees.employeeCode,
      firstName: persons.firstName, lastName: persons.lastName, date: dtrEntries.date,
    })
    .from(dtrEntries)
    .innerJoin(employees, eq(employees.id, dtrEntries.employeeId))
    .innerJoin(persons, eq(persons.id, employees.personId))
    .where(and(isNull(dtrEntries.assignmentId), between(dtrEntries.date, start, end), inArray(dtrEntries.status, [...WORKED_DTR_STATUSES])))
    .orderBy(persons.lastName, persons.firstName, dtrEntries.date);
}

// Re-resolve the active assignment for an existing DTR row's date and stamp it.
export async function reattributeDtrDay(dtrEntryId: string, opts: { actorUserId?: string | null } = {}): Promise<DtrEntry> {
  const db = getDb();
  const [row] = await db.select().from(dtrEntries).where(eq(dtrEntries.id, dtrEntryId)).limit(1);
  if (!row) throw new Error(`[dtr/reattributeDtrDay] no entry ${dtrEntryId}`);
  const active = await getActiveAssignment(row.employeeId, row.date);
  if (!active) throw new Error('[dtr/reattributeDtrDay] still no active posting on that date — assign the guard first');
  const [updated] = await db.update(dtrEntries).set({ assignmentId: active.id }).where(eq(dtrEntries.id, dtrEntryId)).returning();
  await audit.record({ actor: opts.actorUserId ?? null, action: 'dtr.reattributed', target: { kind: 'dtr_entry', id: dtrEntryId }, payload: { assignmentId: active.id, date: row.date } });
  return updated!;
}
```
Add `isNull` to the drizzle import. Export all three from `modules/dtr/index.ts`.
- [ ] **Step 4: Run → pass**; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(dtr): billing readers (billed/unattributed) + single-day re-attribution`

---

### Task 3: `billing` schema + migration `0027` + config service

**Files:** Create `modules/billing/schema.ts`, `modules/billing/service.ts`, `modules/billing/index.ts`, `drizzle/migrations/0027_slice4_billing.sql`; Test `modules/billing/billing.test.ts`.

- [ ] **Step 1: Schema** (`modules/billing/schema.ts`) — contract §5a:
```ts
import { pgTable, uuid, text, integer, boolean, numeric, date, timestamp, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { clients, detachments } from '@/modules/clients/schema';
import { employees } from '@/modules/hr/schema';

export const billingInvoiceStatus = pgEnum('billing_invoice_status', ['draft', 'finalized', 'paid']);

export const clientBillingConfig = pgTable('client_billing_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }).unique(),
  ratePerManday: numeric('rate_per_manday', { precision: 12, scale: 2 }).notNull(),
  paymentTermsDays: integer('payment_terms_days').notNull().default(15),
  chargesVat: boolean('charges_vat').notNull().default(true),
  clientWithholdsEwt: boolean('client_withholds_ewt').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const billingInvoices = pgTable('billing_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  soaNumber: text('soa_number').unique(),            // null until finalized
  status: billingInvoiceStatus('status').notNull().default('draft'),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  vatAmount: numeric('vat_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  ewtAmount: numeric('ewt_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  totalDue: numeric('total_due', { precision: 12, scale: 2 }).notNull().default('0'),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientPeriodUq: unique('billing_invoice_client_period_uq').on(t.clientId, t.periodStart, t.periodEnd),
  clientIdx: index('billing_invoice_client_idx').on(t.clientId),
}));

export const billingInvoiceLines = pgTable('billing_invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => billingInvoices.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  employeeCodeSnapshot: text('employee_code_snapshot').notNull(),
  employeeNameSnapshot: text('employee_name_snapshot').notNull(),
  detachmentId: uuid('detachment_id').notNull().references(() => detachments.id, { onDelete: 'restrict' }),
  detachmentNameSnapshot: text('detachment_name_snapshot').notNull(),
  daysWorked: integer('days_worked').notNull(),
  ratePerManday: numeric('rate_per_manday', { precision: 12, scale: 2 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
}, (t) => ({ invoiceIdx: index('billing_invoice_line_invoice_idx').on(t.invoiceId) }));

// Gapless, concurrency-safe SOA numbering (one counter row per year, locked on increment).
export const billingSoaCounters = pgTable('billing_soa_counters', {
  year: integer('year').primaryKey(),
  nextValue: integer('next_value').notNull().default(1),
});

export type BillingInvoice = typeof billingInvoices.$inferSelect;
export type BillingInvoiceLine = typeof billingInvoiceLines.$inferSelect;
export type ClientBillingConfig = typeof clientBillingConfig.$inferSelect;
```
- [ ] **Step 2: Migration** — hand-write `drizzle/migrations/0027_slice4_billing.sql`: `CREATE TYPE billing_invoice_status AS ENUM (...)` wrapped in a `DO $$ … duplicate_object` guard (per the 0026 idempotency pattern), then the four `CREATE TABLE`s + indexes + the two unique constraints. Plain additive — no destructive gating. Apply to dev **and** `NODE_ENV=test` ([reference_migration_workflow]).
- [ ] **Step 3: Config service** (`modules/billing/service.ts`):
```ts
export async function setClientBillingConfig(input: { clientId: string; ratePerManday: string; paymentTermsDays?: number; chargesVat?: boolean; clientWithholdsEwt?: boolean; actorUserId?: string | null }): Promise<ClientBillingConfig> {
  // upsert on clientId (onConflictDoUpdate); audit 'billing.config.updated' with { clientId } only (no PII); return row.
}
export async function getClientBillingConfig(clientId: string): Promise<ClientBillingConfig | null> { /* select by clientId */ }
```
- [ ] **Step 4: Failing tests** (`billing.test.ts`) — `setClientBillingConfig` inserts then updates the same client (one row, rate changes), audits `billing.config.updated`; `getClientBillingConfig` returns null when unset.
- [ ] **Step 5: Run → fail → implement → pass**; `pnpm typecheck`.
- [ ] **Step 6: Commit** — `feat(billing): schema (0027) + client billing config`

---

### Task 4: `generateInvoice` — the core (draft from DTR, local check, guards)

**Files:** Modify `modules/billing/service.ts`; Test `modules/billing/billing.test.ts`.

- [ ] **Step 1: Failing tests** (build on Task 2/3 fixtures + a locked pay run for the period):
  - **No pay run** for the period → throws `/run .*payroll.*first/i`.
  - **No billing rate** set for the client → throws `/billing rate/i`.
  - **Happy path:** client rate `780.00`, guard A 15 days + guard C 12 days at detachment "Main" → invoice `status='draft'`, two lines `(A,Main,15,780,11700.00)`, `(C,Main,12,780,9360.00)`, `subtotal='21060.00'`, `vatAmount='2527.20'` (chargesVat), `ewtAmount='421.20'` (withholds), `totalDue='23166.00'`. Lines carry `employeeCodeSnapshot`/`employeeNameSnapshot`/`detachmentNameSnapshot`.
  - **Mid-period transfer:** guard who moved Client-X→Client-Y mid-period appears on X's invoice only for the X-days.
  - **Re-generate a draft** wipes + recomputes lines (no duplicates; rate change reflected).
  - **Refuses** when the invoice is already `finalized`.
  - **Local check:** if a guard's billed days for this client exceed their payslip `daysWorked` (forced fixture), throws `/exceeds payroll/i`.
  - Audits `billing.invoice.generated` with `{ clientId, periodStart, periodEnd, subtotal, totalDue }` — **no guard names/PII**.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement:**
```ts
import { payRuns, payslips } from '@/modules/payroll/schema';
import { billedDaysByEmployeeDetachment } from '@/modules/dtr';
const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2); // placeholder-grade money rounding (§7.11)

export async function generateInvoice(clientId: string, period: { start: string; end: string }, opts: { actorUserId?: string | null } = {}): Promise<BillingInvoiceWithLines> {
  const db = getDb();
  // Guard: the period's payroll must have run (reconciliation baseline + local check need payslips).
  const [run] = await db.select().from(payRuns).where(and(eq(payRuns.periodStart, period.start), eq(payRuns.periodEnd, period.end))).limit(1);
  if (!run) throw new Error('[billing/generateInvoice] no pay run for this period — run payroll first');
  const cfg = await getClientBillingConfig(clientId);
  if (!cfg) throw new Error('[billing/generateInvoice] set a billing rate for this client first');

  // Upsert the draft invoice; refuse if finalized; wipe lines if re-generating.
  const [existing] = await db.select().from(billingInvoices).where(and(eq(billingInvoices.clientId, clientId), eq(billingInvoices.periodStart, period.start), eq(billingInvoices.periodEnd, period.end))).limit(1);
  if (existing && existing.status !== 'draft') throw new Error('[billing/generateInvoice] invoice already finalized — cannot regenerate');
  const invoice = existing ?? (await db.insert(billingInvoices).values({ clientId, periodStart: period.start, periodEnd: period.end }).returning())[0]!;
  if (existing) await db.delete(billingInvoiceLines).where(eq(billingInvoiceLines.invoiceId, invoice.id));

  const rate = Number(cfg.ratePerManday);
  const billed = await billedDaysByEmployeeDetachment(clientId, period.start, period.end);

  // Local sanity check: this client's billed days per guard ≤ that guard's payslip days.
  const slipDays = new Map((await db.select({ employeeId: payslips.employeeId, d: payslips.daysWorked }).from(payslips).where(eq(payslips.payRunId, run.id))).map(r => [r.employeeId, Number(r.d)]));
  const perGuard = new Map<string, number>();
  for (const b of billed) perGuard.set(b.employeeId, (perGuard.get(b.employeeId) ?? 0) + b.days);
  for (const [empId, days] of perGuard) if (days > (slipDays.get(empId) ?? 0)) throw new Error('[billing/generateInvoice] billed days exceed payroll for a guard — re-run payroll for this period');

  let subtotalNum = 0;
  for (const b of billed) {
    const amount = b.days * rate;
    subtotalNum += amount;
    await db.insert(billingInvoiceLines).values({
      invoiceId: invoice.id, employeeId: b.employeeId, employeeCodeSnapshot: b.employeeCode,
      employeeNameSnapshot: `${b.lastName}, ${b.firstName}`, detachmentId: b.detachmentId, detachmentNameSnapshot: b.detachmentName,
      daysWorked: b.days, ratePerManday: cfg.ratePerManday, amount: round2(amount),
    });
  }
  const vat = cfg.chargesVat ? Number(round2(subtotalNum * 0.12)) : 0;       // ⚑ placeholder treatment (§7.9)
  const ewt = cfg.clientWithholdsEwt ? Number(round2(subtotalNum * 0.02)) : 0;
  const [updated] = await db.update(billingInvoices).set({ subtotal: round2(subtotalNum), vatAmount: round2(vat), ewtAmount: round2(ewt), totalDue: round2(subtotalNum + vat - ewt), generatedAt: new Date() }).where(eq(billingInvoices.id, invoice.id)).returning();
  await audit.record({ actor: opts.actorUserId ?? null, action: 'billing.invoice.generated', target: { kind: 'billing_invoice', id: invoice.id }, payload: { clientId, periodStart: period.start, periodEnd: period.end, subtotal: updated!.subtotal, totalDue: updated!.totalDue } });
  await events.publish('billing.invoice.generated', { invoiceId: invoice.id, clientId });
  return getInvoiceWithLines(invoice.id) as Promise<BillingInvoiceWithLines>;
}
```
(Define `BillingInvoiceWithLines = BillingInvoice & { lines: BillingInvoiceLine[] }` + `getInvoiceWithLines(id)` in this task.)
- [ ] **Step 4: Run → pass**; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(billing): generateInvoice — draft SOA from DTR + local check + guards`

---

### Task 5: `finalizeInvoice` + `markPaid` + gapless SOA numbering

**Files:** Modify `modules/billing/service.ts`; Test `modules/billing/billing.test.ts`.

- [ ] **Step 1: Failing tests:**
  - `finalizeInvoice` on a draft → `status='finalized'`, `soaNumber` matches `^<year>-\d{4}$` (year from `periodEnd`), `finalizedAt` set; audits `billing.invoice.finalized`.
  - Two sequential finalizes in the same year → `…-0001` then `…-0002` (**gapless, no collision**).
  - Finalizing an **empty** invoice (no lines) → throws `/no lines/i` (mirror `lockPayRun`'s empty guard).
  - Finalizing an already-finalized invoice → throws `/already finalized/i`.
  - `markPaid` on a **finalized** invoice → `status='paid'`, `paidAt` set, audits `billing.invoice.paid`.
  - `markPaid` on a **draft** → throws `/finalize/i` (draft→paid rejected).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — `finalizeInvoice` in a transaction: guard already-finalized; guard no lines; allocate the number by locking/incrementing the year counter, then set status/soaNumber/finalizedAt:
```ts
export async function finalizeInvoice(invoiceId: string, opts: { actorUserId?: string | null } = {}): Promise<BillingInvoice> {
  return getDb().transaction(async (tx) => {
    const [inv] = await tx.select().from(billingInvoices).where(eq(billingInvoices.id, invoiceId)).limit(1);
    if (!inv) throw new Error(`[billing/finalizeInvoice] no invoice ${invoiceId}`);
    if (inv.status !== 'draft') throw new Error('[billing/finalizeInvoice] invoice already finalized');
    const [{ n }] = await tx.select({ n: count() }).from(billingInvoiceLines).where(eq(billingInvoiceLines.invoiceId, invoiceId));
    if (Number(n) === 0) throw new Error('[billing/finalizeInvoice] invoice has no lines — generate it first');
    const year = Number(inv.periodEnd.slice(0, 4));
    // Gapless + concurrency-safe: the counter row is locked for this txn; rollback rolls the number back too.
    // next_value = the next number to assign. Allocate = (resulting next_value) - 1, which is
    // consistent on BOTH paths: insert path 2-1=1, conflict path (old+1)-1=old. Gapless because the
    // counter row is locked for this txn and rolls back with it.
    const [{ seq }] = await tx.execute<{ seq: number }>(sql`
      INSERT INTO billing_soa_counters (year, next_value) VALUES (${year}, 2)
      ON CONFLICT (year) DO UPDATE SET next_value = billing_soa_counters.next_value + 1
      RETURNING next_value - 1 AS seq`) as unknown as Array<{ seq: number }>;
    const soaNumber = `${year}-${String(seq).padStart(4, '0')}`;
    const [done] = await tx.update(billingInvoices).set({ status: 'finalized', soaNumber, finalizedAt: new Date() }).where(eq(billingInvoices.id, invoiceId)).returning();
    await audit.record({ actor: opts.actorUserId ?? null, action: 'billing.invoice.finalized', target: { kind: 'billing_invoice', id: invoiceId }, payload: { soaNumber, totalDue: done!.totalDue } });
    return done!;
  });
}
```
> **Numbering note for the implementer:** the `RETURNING next_value - 1 AS seq` gives the allocated number on both the insert and conflict paths (verify with a test that finalizes two invoices same-year and asserts `-0001`/`-0002`, and ideally a concurrent-finalize test). If the `INSERT…ON CONFLICT` form reads awkwardly, switch to `SELECT … FOR UPDATE` then `UPDATE` in the same txn — same guarantee, clearer. The **invariant** is what matters: gapless, unique, no collision under concurrency.

`markPaid`: load invoice; if `status !== 'finalized'` throw `'[billing/markPaid] finalize the invoice before marking it paid'`; set `status='paid'`, `paidAt`; audit `billing.invoice.paid`.
- [ ] **Step 4: Run → pass**; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(billing): finalize (gapless SOA number) + markPaid`

---

### Task 6: `reconcilePeriod` + `listUnattributedWorkedDays` passthrough + reads

**Files:** Modify `modules/billing/service.ts`; Test `modules/billing/billing.test.ts`.

- [ ] **Step 1: Failing tests:**
  - **Split guard reconciles:** guard with 4 days billed on Client-X's SOA + 11 on Client-Y's SOA + payslip `daysWorked=15` → `reconcilePeriod` returns **no** mismatch for that guard (Σ billed + unattributed = payslip).
  - **DTR-changed-after-payroll:** payslip says 15 but billed+unattributed = 14 → returns a mismatch `{ employeeCode, billed, unattributed, payslipDays }`.
  - **Unattributed counts in:** guard with 13 billed + 2 unattributed + payslip 15 → no mismatch.
  - `listUnattributedWorkedDays(period)` (billing passthrough to the dtr reader) returns the period's null-posting days.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement:**
```ts
export type ReconcileMismatch = { employeeId: string; employeeCode: string; billed: number; unattributed: number; payslipDays: number };
export async function reconcilePeriod(period: { start: string; end: string }): Promise<ReconcileMismatch[]> {
  // payslip days per employee for the period's run; billed = SUM(lines.daysWorked) across ALL invoices for the period
  // (join billing_invoices on period); unattributed = COUNT of that employee's null-assignment worked days in period.
  // Return rows where billed + unattributed !== payslipDays.
}
export async function listUnattributedWorkedDays(period: { start: string; end: string }) { return dtr.listUnattributedWorkedDays(period.start, period.end); }
export async function listInvoices(filter: { clientId?: string; status?: 'draft'|'finalized'|'paid' } = {}): Promise<BillingInvoice[]> { /* ordered by periodStart desc */ }
```
- [ ] **Step 4: Run → pass**; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(billing): period reconciliation + unattributed surface + list reads`

---

### Task 7: `billing` public surface + module README

**Files:** Modify `modules/billing/index.ts`; Create `modules/billing/README.md`.

- [ ] **Step 1:** `index.ts` exports the `billing` namespace object + named exports: `setClientBillingConfig`, `getClientBillingConfig`, `generateInvoice`, `finalizeInvoice`, `markPaid`, `reconcilePeriod`, `listUnattributedWorkedDays`, `listInvoices`, `getInvoiceWithLines`; type exports `BillingInvoice`, `BillingInvoiceLine`, `BillingInvoiceWithLines`, `ClientBillingConfig`. **Nothing else.**
- [ ] **Step 2:** `README.md` — Purpose / Public API table / Dependencies (`dtr`, `clients`, `assignments`, `hr`, `persons`, `payroll`, `audit`, `events`; tables owned) / Known failure modes (no pay run for period; no rate set; finalize empty; regenerate-after-finalize refused; SOA-number collision symptoms).
- [ ] **Step 3:** `pnpm typecheck`. **Step 4: Commit** — `feat(billing): public surface + module README`

---

### Task 8: App — Client "Billing & Contract" section

**Files:** Modify `app/(admin)/clients/[id]/` (page + a `billing-section` component + `actions.ts`).

- [ ] **Step 1:** On the client detail page, add a **Billing & Contract** section (contract W1) below existing fields: rate (₱/man-day), payment terms, **Charge VAT 12%** + **Client withholds 2% EWT** toggles (each with the ⚑ "confirm w/ CGoC" note). Server action `saveBillingConfigAction` (`'use server'`) → `billing.setClientBillingConfig({ …, actorUserId: session.user.id })`; Zod-validate the rate (positive decimal). Follow the existing client-edit action pattern + `Field`/labels shared helpers ([feedback_avoid_helper_duplication], [feedback_screen_layout_pattern]).
- [ ] **Step 2:** `pnpm typecheck`. **Step 3: Commit** — `feat(clients-ui): billing & contract section`

---

### Task 9: App — Billing area (SOA list + generate + detail/print + unattributed) + nav

**Files:** Create `app/(admin)/billing/page.tsx` (list), `app/(admin)/billing/[invoiceId]/page.tsx` (detail/print), `app/(admin)/billing/actions.ts`; modify the sidebar nav.

- [ ] **Step 1: List + generate** (`/billing`, contract W2/W3) via `PageShell`: `billing.listInvoices()` table (SOA No · Client · Period · Total · Status chip draft/finalized/paid) + a **Generate SOA** control (client typeahead + period dropdown sourced from `payroll.listPayRuns`) → `generateInvoiceAction`. Below it, a **period-level Unattributed worked days** panel (`billing.listUnattributedWorkedDays`) with a **Re-attach** action (`reattributeDtrDayAction` → `dtr.reattributeDtrDay`). Actions pass `actorUserId` from session; surface module errors as plain-language inline messages (no Next error overlay), per the 3b action-hardening pattern.
- [ ] **Step 2: Detail / print** (`/billing/[invoiceId]`): `billing.getInvoiceWithLines` → the detailed SOA (contract W4) — header (Commander Group issuer, Bill-To client, SOA No/Period/Due = periodEnd + paymentTermsDays), per-guard lines (code · name · post · days · rate · amount), subtotal, VAT/EWT (⚑ placeholder), total. Buttons: **Finalize** (`finalizeInvoiceAction`, draft only) and **Mark paid** (`markPaidAction`, finalized only); print-friendly layout.
- [ ] **Step 3:** Add **Billing** to the sidebar nav.
- [ ] **Step 4:** `pnpm typecheck` + `pnpm lint`. **Step 5: Commit** — `feat(billing-ui): SOA list + generate + detail/print + unattributed panel + nav`

---

### Task 10: Verify Slice 4

**Files:** Update `modules/billing/README.md` (failure modes found), `modules/dtr/README.md` (new readers + reattribute), `modules/payroll/README.md` (worked-day def now from dtr); create `wiki/slices/4-billing-and-soa-done-sweep.md`.

- [ ] **Step 1:** `pnpm test && pnpm typecheck && pnpm lint` green. Confirm the **payroll suite is unchanged** (Task 1 was behavior-neutral) and slices 1–3 golden paths pass.
- [ ] **Step 2: Playwright walk** (login `admin@sentinel.local`, dev on :3000) of the contract §4 demo: set a client rate → (payroll already run for a period) → Generate SOA → draft per-guard SOA → **mid-period transfer** shows on two clients' SOAs → an **unattributed day** appears in the period panel and re-attaches → **Finalize** (number assigned) → **Mark paid**. Screenshot each step and **Read** the PNGs ([feedback_browser_verify_with_playwright]).
- [ ] **Step 3:** Module READMEs + done-sweep (record any deltas from this plan, the reconciliation/unattributed decisions, and the §7 risk dispositions). **Step 4: Commit** — `docs(billing): READMEs + slice-4 done-sweep`

---

## Self-Review

**Coverage vs [contract](4-billing-and-soa.md):** §5b/5c → T1+T2 (shared worked-day def, billing readers, re-attribution) · §5a schema/numbering → T3/T5 · generate (frozen stamp, flat rate, local check, no-pay-run + finalized guards) → T4 · finalize/markPaid lifecycle → T5 · reconcilePeriod + unattributed → T6 · public surface → T7 · §5d UI (W1 client section; W2/W3/W4 billing area + period-level unattributed) → T8/T9 · done criteria §8 + Playwright walk → T10. Risks §7: frozen-stamp (T2/T4), worked-day drift (T1), unattributed period-level + zero-posting guard (T2/T6/T9), period-wide reconcile not per-SOA (T6), gapless numbering (T5), regenerate/finalize guards (T4/T5), no-pay-run guard (T4), flat-rate-on-holidays documented (contract §9). ✅

**Deferred (NOT in this plan, per contract §9):** rate stack / armed-unarmed rates, real VAT-EWT/wage-fee model, summary SOA view, sent status, aging/partial/credit notes, per-client frequency, PDF branding, RBAC, redaction-vs-financial-record policy, bulk re-attribution.

**Type consistency:** `BilledDays`/`UnattributedDay` (T2) consumed unchanged in T4/T6; `BillingInvoiceWithLines` defined in T4, reused T6/T7/T9; `round2` (T4) reused in T5 only via stored strings (no cross-task drift). Service fn names match the §5a public-API table and T7 exports exactly.

**Placeholders:** real schema, real generate/finalize code, concrete test assertions with numbers. UI tasks (T8/T9) reference shipped patterns (`PageShell`, `Field`, `Pagination`, the 3b action-hardening + session `actorUserId`) rather than restating them — these are the established conventions, not gaps. No TBD.

**Known soft spot flagged for the implementer:** the SOA-number `INSERT…ON CONFLICT…RETURNING` shim (T5) — the plan tells the implementer to test the two-finalize sequence and swap to `SELECT…FOR UPDATE` if clearer. The invariant (gapless/unique/concurrency-safe) is the contract; the exact SQL is the implementer's to confirm.
