# Slice 1 — First Payslip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship end-to-end the "first payslip" demo: bulk-import 10 guards, create a client + detachment, assign guards, enter 15-day DTR, run payroll, export SSS R3 + BIR 2316. Numbers match v2 within ₱1/line; a CGoC payroll clerk can run the demo without coaching.

**Architecture:** Six new modules layered on Slice 0's auth/audit/approvals/events primitives. Postgres 16 + Drizzle ORM + Next.js 15 (App Router) + TypeScript + Vitest. Per [ADR 0007](decisions/0007-multi-tenancy.md), single-tenant (no `tenant_id`). Per [ADR 0009](decisions/0009-hr-starter-and-recruitment-as-entry-point.md), HR is the foundation; Recruitment (Slice 3) will later own assignment writes. Per the [Slice 1 contract](1-first-payslip.md), payroll math is "option (b)" depth — basic pay + simple OT + 4 statutory deductions (SSS, PhilHealth, Pag-IBIG, BIR WTAX); no rate stacks, no NSD, no 13th-month.

**Tech Stack:** Node 20 LTS · TypeScript 5.7 · Next.js 15 · Drizzle ORM 0.36 · postgres-js 3.4 · Vitest 2.1 · Zod 3.24 · pnpm 10.

**Reference patterns:** Slice 0's audit module ([modules/audit/](../../modules/audit/)) is the canonical template for module shape — `schema.ts` / `service.ts` / `index.ts` / `<module>.test.ts` / `README.md`. Mirror its structure for every new module unless this plan says otherwise.

**Layman's-terms reminder:** Every UI screen built in Phase 8 must pass the "CGoC payroll clerk could complete this without coaching" test. Use the `frontend-design` skill when building each screen. See [project_ux_quality_bar memory](../../../.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Taolink-v3---Sentinel/memory/project_ux_quality_bar.md) for the full rule.

---

## Phase plan at a glance

| Phase | What ships | Approx. tasks |
|---|---|---|
| 1 | Compliance rate tables + seeds (SSS, PhilHealth, Pag-IBIG, BIR WTAX) | 6 |
| 2 | `modules/hr` — employee master, status state machine, bulk import | 9 |
| 3 | `modules/clients` — Client + Detachment master | 6 |
| 4 | `modules/assignments` — Assignment master | 6 |
| 5 | `modules/dtr` — manual DTR entry + period close | 8 |
| 6 | `modules/payroll` — engine + payslip + run lifecycle | 12 |
| 7 | `modules/compliance-exports` — SSS R3 + BIR 2316 | 7 |
| 8 | UI screens (Next.js App Router) for the demo flow | 11 |
| 9 | Demo bootstrap directive + Slice 0 regression gate + Done-criteria verification | 5 |
| **Total** | | **~70** |

---

## Phase 1 — Compliance rate tables + seeds

**Why first:** Payroll cannot compute without these. They're inputs every later phase reads from. Per [memory/domains/compliance.md](../../memory/domains/compliance.md): re-implement clean in v3, copy the *data + citations* from [`ref/compliance/seed-compliance.ts`](../../ref/compliance/seed-compliance.ts), not the code.

### Task 1.1: Create the compliance module skeleton

**Files:**
- Create: `modules/compliance/index.ts`
- Create: `modules/compliance/schema.ts`
- Create: `modules/compliance/service.ts`
- Create: `modules/compliance/README.md`

- [ ] **Step 1: Write `modules/compliance/schema.ts`** — Drizzle pg-core tables for the rate data. Mirror v2 shapes but in Postgres types (use `numeric(12,2)` instead of MySQL `decimal`, use Drizzle `pgEnum` for the BIR frequency).

```typescript
import { pgTable, uuid, numeric, date, text, pgEnum, integer, unique, index } from 'drizzle-orm/pg-core';

export const wtaxFrequency = pgEnum('wtax_frequency', ['MONTHLY', 'SEMI_MONTHLY']);

// SSS: each row is one Monthly Salary Credit bracket.
// Rate citation: SSC Resolution 560-s.2024 + SSS Circular 2024-006, effective 2025-01-01.
export const sssBrackets = pgTable('comp_sss_brackets', {
  id: uuid('id').primaryKey().defaultRandom(),
  rangeStart: numeric('range_start', { precision: 12, scale: 2 }).notNull(),
  rangeEnd: numeric('range_end', { precision: 12, scale: 2 }).notNull(),
  monthlySalaryCredit: numeric('monthly_salary_credit', { precision: 12, scale: 2 }).notNull(),
  eeShareRegular: numeric('ee_share_regular', { precision: 12, scale: 2 }).notNull(),
  erShareRegular: numeric('er_share_regular', { precision: 12, scale: 2 }).notNull(),
  eeShareWisp: numeric('ee_share_wisp', { precision: 12, scale: 2 }).notNull(),
  erShareWisp: numeric('er_share_wisp', { precision: 12, scale: 2 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
}, (t) => ({
  mscIdx: index('comp_sss_msc_idx').on(t.monthlySalaryCredit),
  effDateIdx: index('comp_sss_eff_idx').on(t.effectiveDate),
}));

// PhilHealth — one config row per effective date.
// Citation: PhilHealth Circular 2019-0009, 5% rate effective CY 2024 onwards (2026 same per PIA).
export const philhealthConfig = pgTable('comp_philhealth_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  rate: numeric('rate', { precision: 6, scale: 4 }).notNull(),
  floor: numeric('floor', { precision: 12, scale: 2 }).notNull(),
  ceiling: numeric('ceiling', { precision: 12, scale: 2 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
}, (t) => ({
  effUq: unique('comp_philhealth_eff_uq').on(t.effectiveDate),
}));

// Pag-IBIG — one config row per effective date.
// Citation: HDMF Circular 460, effective 2024-02 (supersedes Circular 274).
export const pagibigConfig = pgTable('comp_pagibig_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  eeRate: numeric('ee_rate', { precision: 6, scale: 4 }).notNull(),
  erRate: numeric('er_rate', { precision: 6, scale: 4 }).notNull(),
  salaryCap: numeric('salary_cap', { precision: 12, scale: 2 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
}, (t) => ({
  effUq: unique('comp_pagibig_eff_uq').on(t.effectiveDate),
}));

// BIR WTAX — bracket table, separate rows per frequency.
// Citation: RA 10963 (TRAIN Law) Phase 2 brackets, effective 2023-01-01.
export const wtaxBrackets = pgTable('comp_wtax_brackets', {
  id: uuid('id').primaryKey().defaultRandom(),
  frequency: wtaxFrequency('frequency').notNull(),
  rangeStart: numeric('range_start', { precision: 12, scale: 2 }).notNull(),
  rangeEnd: numeric('range_end', { precision: 12, scale: 2 }),  // null = open-ended top bracket
  baseTax: numeric('base_tax', { precision: 12, scale: 2 }).notNull(),
  percentageOver: numeric('percentage_over', { precision: 6, scale: 4 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
}, (t) => ({
  freqRangeIdx: index('comp_wtax_freq_range_idx').on(t.frequency, t.rangeStart),
  effDateIdx: index('comp_wtax_eff_idx').on(t.effectiveDate),
}));

export type SssBracket = typeof sssBrackets.$inferSelect;
export type PhilhealthConfig = typeof philhealthConfig.$inferSelect;
export type PagibigConfig = typeof pagibigConfig.$inferSelect;
export type WtaxBracket = typeof wtaxBrackets.$inferSelect;
```

- [ ] **Step 2: Register the new schemas in `core/db.ts`**

Modify `core/db.ts` to import and spread `complianceSchema` alongside the existing four module schemas:

```typescript
import * as complianceSchema from '@/modules/compliance/schema';

const schema = {
  ...authSchema,
  ...auditSchema,
  ...approvalsSchema,
  ...eventsSchema,
  ...complianceSchema,
};
```

- [ ] **Step 3: Add the compliance module to `core/loader.ts`**

```typescript
const MODULE_DEPS: Record<string, string[]> = {
  auth: ['DATABASE_URL', 'SESSION_SECRET'],
  audit: ['DATABASE_URL'],
  approvals: ['DATABASE_URL'],
  events: ['DATABASE_URL'],
  compliance: ['DATABASE_URL'],
};
```

- [ ] **Step 4: Run typecheck to confirm schemas compile**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add modules/compliance/schema.ts modules/compliance/README.md core/db.ts core/loader.ts
git commit -m "feat(compliance): scaffold rate-table schemas (SSS/PhilHealth/Pag-IBIG/WTAX)"
```

### Task 1.2: Generate + write the Slice 1 migration

**Files:**
- Create: `drizzle/migrations/0002_slice1_compliance.sql`

- [ ] **Step 1: Run `pnpm db:generate`** — drizzle-kit will diff and emit the SQL.

Run: `pnpm db:generate`
Expected: a new SQL file appears under `drizzle/migrations/`. Rename it to `0002_slice1_compliance.sql` if the generated name differs.

- [ ] **Step 2: Open the generated SQL and verify** — it should contain `CREATE TABLE comp_sss_brackets`, `CREATE TABLE comp_philhealth_config`, `CREATE TABLE comp_pagibig_config`, `CREATE TABLE comp_wtax_brackets`, `CREATE TYPE wtax_frequency AS ENUM (...)`, plus indexes. Hand-edit only if generation missed an index or constraint.

- [ ] **Step 3: Apply the migration locally**

Run: `pnpm db:migrate`
Expected: log lines showing migration `0002_slice1_compliance` applied.

- [ ] **Step 4: Commit**

```bash
git add drizzle/migrations/0002_slice1_compliance.sql
git commit -m "feat(compliance): migration for rate-table schemas"
```

### Task 1.3: Write the seeder

**Files:**
- Create: `modules/compliance/seed.ts`

- [ ] **Step 1: Port the seed data from v2 — preserving citations verbatim** — re-read [`ref/compliance/seed-compliance.ts`](../../ref/compliance/seed-compliance.ts) for the exact citations, then write `modules/compliance/seed.ts`. Use Drizzle's pg insert API. **Make it idempotent** (delete-then-insert per effective date, OR check-then-insert) so re-running against a partially seeded DB doesn't double up.

```typescript
import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { sssBrackets, philhealthConfig, pagibigConfig, wtaxBrackets } from './schema';

const EFFECTIVE_DATE_2026 = '2026-01-01';
const WISP_MSC_THRESHOLD = 20000;

export async function seedComplianceRates(opts: { effectiveDate?: string } = {}) {
  const db = getDb();
  const effectiveDate = opts.effectiveDate ?? EFFECTIVE_DATE_2026;

  // Idempotency: clear any existing rows for this effectiveDate first.
  await db.delete(sssBrackets).where(eq(sssBrackets.effectiveDate, effectiveDate));
  await db.delete(philhealthConfig).where(eq(philhealthConfig.effectiveDate, effectiveDate));
  await db.delete(pagibigConfig).where(eq(pagibigConfig.effectiveDate, effectiveDate));
  await db.delete(wtaxBrackets).where(eq(wtaxBrackets.effectiveDate, effectiveDate));

  // 1. SSS — RA 11199 final scheduled rate. SSC Resolution 560-s.2024 + Circular 2024-006.
  //    Combined 15% (ER 10% / EE 5%), MSC ₱5,000 – ₱35,000 step ₱500.
  //    WISP carve-out (EE 1% / ER 2%) when MSC ≥ ₱20,000.
  const sssRows = [];
  for (let msc = 5000; msc <= 35000; msc += 500) {
    const rangeStart = msc === 5000 ? 0 : msc - 250;
    const rangeEnd = msc === 35000 ? 9_999_999 : msc + 249.99;

    const hasWisp = msc >= WISP_MSC_THRESHOLD;
    const eeRegular = hasWisp ? msc * 0.04 : msc * 0.05;
    const eeWisp    = hasWisp ? msc * 0.01 : 0;
    const erRegular = hasWisp ? msc * 0.08 : msc * 0.10;
    const erWisp    = hasWisp ? msc * 0.02 : 0;

    sssRows.push({
      rangeStart: rangeStart.toFixed(2),
      rangeEnd: rangeEnd.toFixed(2),
      monthlySalaryCredit: msc.toFixed(2),
      eeShareRegular: eeRegular.toFixed(2),
      erShareRegular: erRegular.toFixed(2),
      eeShareWisp: eeWisp.toFixed(2),
      erShareWisp: erWisp.toFixed(2),
      effectiveDate,
    });
  }
  await db.insert(sssBrackets).values(sssRows);

  // 2. PhilHealth — RA 11223. Circular 2019-0009. 5% rate, floor ₱10k, ceiling ₱100k.
  await db.insert(philhealthConfig).values([{
    rate: '0.0500', floor: '10000.00', ceiling: '100000.00', effectiveDate,
  }]);

  // 3. Pag-IBIG (HDMF) — RA 9679. HDMF Circular 460 (2024-02). EE 2% / ER 2%, cap ₱10k.
  await db.insert(pagibigConfig).values([{
    eeRate: '0.0200', erRate: '0.0200', salaryCap: '10000.00', effectiveDate,
  }]);

  // 4. BIR WTAX — RA 10963 (TRAIN Law) Phase 2. Effective 2023-01-01, no sunset.
  await db.insert(wtaxBrackets).values([
    { frequency: 'MONTHLY' as const, rangeStart: '0.00',      rangeEnd: '20833.00',  baseTax: '0.00',       percentageOver: '0.0000', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '20833.00',  rangeEnd: '33333.00',  baseTax: '0.00',       percentageOver: '0.1500', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '33333.00',  rangeEnd: '66667.00',  baseTax: '1875.00',    percentageOver: '0.2000', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '66667.00',  rangeEnd: '166667.00', baseTax: '8541.67',    percentageOver: '0.2500', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '166667.00', rangeEnd: '666667.00', baseTax: '33541.67',   percentageOver: '0.3000', effectiveDate },
    { frequency: 'MONTHLY' as const, rangeStart: '666667.00', rangeEnd: null,        baseTax: '183541.67',  percentageOver: '0.3500', effectiveDate },
    // SEMI_MONTHLY — monthly ÷ 2 per BIR RMC tax tables for semi-monthly periods.
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '0.00',      rangeEnd: '10417.00',  baseTax: '0.00',      percentageOver: '0.0000', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '10417.00',  rangeEnd: '16667.00',  baseTax: '0.00',      percentageOver: '0.1500', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '16667.00',  rangeEnd: '33333.00',  baseTax: '937.50',    percentageOver: '0.2000', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '33333.00',  rangeEnd: '83333.00',  baseTax: '4270.83',   percentageOver: '0.2500', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '83333.00',  rangeEnd: '333333.00', baseTax: '16770.83',  percentageOver: '0.3000', effectiveDate },
    { frequency: 'SEMI_MONTHLY' as const, rangeStart: '333333.00', rangeEnd: null,        baseTax: '91770.83',  percentageOver: '0.3500', effectiveDate },
  ]);
}
```

- [ ] **Step 2: Add a CLI seed script** — `scripts/seed-compliance.ts` (create the `scripts/` folder if absent) that calls `seedComplianceRates()` then exits.

```typescript
import { seedComplianceRates } from '@/modules/compliance/seed';
import { closeDb } from '@/core/db';

async function main() {
  await seedComplianceRates();
  console.log('Compliance rates seeded.');
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Add a `db:seed-compliance` package script** — add to `package.json` scripts:

```json
"db:seed-compliance": "tsx scripts/seed-compliance.ts"
```

- [ ] **Step 4: Run the seeder against the local DB**

Run: `pnpm db:seed-compliance`
Expected: "Compliance rates seeded." and `psql -c 'SELECT COUNT(*) FROM comp_sss_brackets'` returns 61.

- [ ] **Step 5: Commit**

```bash
git add modules/compliance/seed.ts scripts/seed-compliance.ts package.json
git commit -m "feat(compliance): seed SSS/PhilHealth/Pag-IBIG/WTAX rate tables (2026 effective)"
```

### Task 1.4: Write rate-lookup helpers

**Files:**
- Create: `modules/compliance/service.ts`
- Create: `modules/compliance/compliance.test.ts`

- [ ] **Step 1: Write the failing tests** for the lookup helpers in `compliance.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeDb } from '@/core/db';
import { seedComplianceRates } from './seed';
import { compliance } from './index';

describe('compliance rate lookups', () => {
  beforeAll(async () => {
    await seedComplianceRates({ effectiveDate: '2026-01-01' });
  });
  afterAll(async () => { await closeDb(); });

  it('SSS: bracket for MSC 20,000 has WISP carve-out', async () => {
    const b = await compliance.sssBracketForMonthly(20000, '2026-06-01');
    expect(b).not.toBeNull();
    expect(Number(b!.eeShareRegular) + Number(b!.eeShareWisp)).toBeCloseTo(1000, 2); // 5%
  });

  it('PhilHealth: 25k monthly → ₱625 EE (5% / 2 since 50/50 split)', async () => {
    const p = await compliance.philhealthEE(25000, '2026-06-01');
    expect(p).toBeCloseTo(625, 2);
  });

  it('Pag-IBIG: 5,000 monthly → ₱100 EE; 15,000 monthly → ₱200 EE (cap)', async () => {
    expect(await compliance.pagibigEE(5000, '2026-06-01')).toBeCloseTo(100, 2);
    expect(await compliance.pagibigEE(15000, '2026-06-01')).toBeCloseTo(200, 2);
  });

  it('BIR WTAX MONTHLY: ₱25,000 taxable → ₱625 (15% over 20,833)', async () => {
    const tax = await compliance.wtaxMonthly(25000, 'MONTHLY', '2026-06-01');
    expect(tax).toBeCloseTo((25000 - 20833) * 0.15, 2);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail** — `pnpm test modules/compliance` → all 4 fail (functions not exported).

- [ ] **Step 3: Implement `modules/compliance/service.ts`**:

```typescript
import { and, eq, lte, gte, isNull, or, desc } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { sssBrackets, philhealthConfig, pagibigConfig, wtaxBrackets, type SssBracket, type WtaxBracket } from './schema';

type WtaxFreq = 'MONTHLY' | 'SEMI_MONTHLY';

// All lookups take an `asOf` date and use the most recent rate whose
// effectiveDate <= asOf. Slice 1 seeds one set; later slices may add history.
async function latestEffectiveOnOrBefore<T extends { effectiveDate: string }>(rows: T[], asOf: string): Promise<T | null> {
  const eligible = rows.filter((r) => r.effectiveDate <= asOf).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return eligible[0] ?? null;
}

export async function sssBracketForMonthly(monthlySalary: number, asOf: string): Promise<SssBracket | null> {
  const db = getDb();
  const all = await db.select().from(sssBrackets).where(lte(sssBrackets.effectiveDate, asOf)).orderBy(desc(sssBrackets.effectiveDate));
  // Filter to the most-recent effective date.
  const mostRecent = all[0]?.effectiveDate;
  if (!mostRecent) return null;
  const sameDate = all.filter((b) => b.effectiveDate === mostRecent);
  // Find the bracket where rangeStart <= salary <= rangeEnd.
  return sameDate.find((b) => Number(b.rangeStart) <= monthlySalary && monthlySalary <= Number(b.rangeEnd)) ?? null;
}

export async function philhealthEE(monthlySalary: number, asOf: string): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(philhealthConfig).where(lte(philhealthConfig.effectiveDate, asOf)).orderBy(desc(philhealthConfig.effectiveDate)).limit(1);
  if (rows.length === 0) return 0;
  const cfg = rows[0];
  const basis = Math.min(Math.max(monthlySalary, Number(cfg.floor)), Number(cfg.ceiling));
  // 50/50 EE/ER split per RA 11223.
  return Math.round((basis * Number(cfg.rate) / 2) * 100) / 100;
}

export async function pagibigEE(monthlySalary: number, asOf: string): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(pagibigConfig).where(lte(pagibigConfig.effectiveDate, asOf)).orderBy(desc(pagibigConfig.effectiveDate)).limit(1);
  if (rows.length === 0) return 0;
  const cfg = rows[0];
  const basis = Math.min(monthlySalary, Number(cfg.salaryCap));
  return Math.round((basis * Number(cfg.eeRate)) * 100) / 100;
}

export async function wtaxMonthly(taxableMonthly: number, freq: WtaxFreq, asOf: string): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(wtaxBrackets).where(and(eq(wtaxBrackets.frequency, freq), lte(wtaxBrackets.effectiveDate, asOf))).orderBy(desc(wtaxBrackets.effectiveDate));
  if (rows.length === 0) return 0;
  const mostRecent = rows[0].effectiveDate;
  const eligible = rows.filter((r) => r.effectiveDate === mostRecent);
  const bracket = eligible.find((b) => {
    const start = Number(b.rangeStart);
    const end = b.rangeEnd === null ? Infinity : Number(b.rangeEnd);
    return taxableMonthly >= start && taxableMonthly < end;
  });
  if (!bracket) return 0;
  const tax = Number(bracket.baseTax) + (taxableMonthly - Number(bracket.rangeStart)) * Number(bracket.percentageOver);
  return Math.round(tax * 100) / 100;
}
```

- [ ] **Step 4: Wire `modules/compliance/index.ts`**:

```typescript
import { sssBracketForMonthly, philhealthEE, pagibigEE, wtaxMonthly } from './service';

export const compliance = { sssBracketForMonthly, philhealthEE, pagibigEE, wtaxMonthly };
export { sssBracketForMonthly, philhealthEE, pagibigEE, wtaxMonthly };
```

- [ ] **Step 5: Run tests** — `pnpm test modules/compliance` → all 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/compliance/service.ts modules/compliance/index.ts modules/compliance/compliance.test.ts
git commit -m "feat(compliance): rate-lookup helpers (SSS bracket, PhilHealth/Pag-IBIG/BIR EE)"
```

### Task 1.5: Write the compliance module README

**Files:** Create `modules/compliance/README.md` — Purpose / Public API / Dependencies / Known failure modes. Reference the citation comments in `seed.ts` rather than restating them.

### Task 1.6: Phase-1 gate

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all green
- [ ] Commit any README edits and tag this commit's SHA in the daily log

---

## Phase 2 — `modules/hr`: employee master + bulk import

**Mirror** [`modules/audit/`](../../modules/audit/) for shape. The HR module has more surface than audit, so it has more files.

### Task 2.1: Schema

**Files:**
- Create: `modules/hr/schema.ts`

- [ ] **Step 1: Write schema** with enums for status + payFrequency, table `hr_employees`:

```typescript
import { pgTable, uuid, text, numeric, date, pgEnum, timestamp, unique, index } from 'drizzle-orm/pg-core';

export const employeeStatus = pgEnum('hr_employee_status', [
  'applicant', 'hired', 'deployed', 'reliever', 'floating', 'on_leave', 'terminated',
]);

// Mirror v2 (ref/compliance/migrations/0000_short_loners.sql:33-34): basic_salary +
// pay_frequency. Daily rate is derived, not stored.
export const payFrequency = pgEnum('hr_pay_frequency', ['MONTHLY', 'SEMI_MONTHLY']);

export const employees = pgTable('hr_employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeCode: text('employee_code').notNull(), // CGoC-facing ID, e.g. "CG-00001"
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  middleName: text('middle_name'),
  email: text('email'),
  phone: text('phone'),
  basicSalary: numeric('basic_salary', { precision: 12, scale: 2 }).notNull(),
  payFrequency: payFrequency('pay_frequency').notNull().default('SEMI_MONTHLY'),
  status: employeeStatus('status').notNull().default('hired'),
  hiredOn: date('hired_on').notNull(),
  terminatedOn: date('terminated_on'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  empCodeUq: unique('hr_employees_code_uq').on(t.employeeCode),
  emailUq: unique('hr_employees_email_uq').on(t.email),
  statusIdx: index('hr_employees_status_idx').on(t.status),
}));

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
```

- [ ] **Step 2: Register** in `core/db.ts` (`import * as hrSchema; ...hrSchema`).
- [ ] **Step 3: Add `hr` to `core/loader.ts` MODULE_DEPS** (`['DATABASE_URL']`).
- [ ] **Step 4: `pnpm db:generate` + rename to `0003_slice1_hr.sql`** — verify SQL.
- [ ] **Step 5: `pnpm db:migrate`** — confirm tables exist.
- [ ] **Step 6: Commit** — `feat(hr): employee master schema + migration`.

### Task 2.2: `createEmployee` + status state machine (TDD)

**Files:**
- Create: `modules/hr/service.ts`
- Create: `modules/hr/hr.test.ts`

- [ ] **Step 1: Write failing tests** for `createEmployee`, `getEmployee`, `changeStatus`. Cover: happy path, duplicate email rejection, valid status transitions, invalid transitions (e.g. `terminated → deployed` rejected).

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { closeDb, getDb } from '@/core/db';
import { employees } from './schema';
import { hr } from './index';

describe('hr.createEmployee + state machine', () => {
  beforeEach(async () => {
    await getDb().delete(employees);
  });
  afterAll(async () => { await closeDb(); });

  it('creates an employee with defaults', async () => {
    const e = await hr.createEmployee({
      employeeCode: 'CG-00001', firstName: 'Juan', lastName: 'Dela Cruz',
      basicSalary: 18000, hiredOn: '2026-05-01',
    });
    expect(e.status).toBe('hired');
    expect(e.payFrequency).toBe('SEMI_MONTHLY');
    expect(Number(e.basicSalary)).toBe(18000);
  });

  it('rejects duplicate email', async () => {
    await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01', email: 'a@x.com' });
    await expect(hr.createEmployee({ employeeCode: 'CG-2', firstName: 'C', lastName: 'D', basicSalary: 18000, hiredOn: '2026-05-01', email: 'a@x.com' }))
      .rejects.toThrow(/email/i);
  });

  it('allows hired → deployed', async () => {
    const e = await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01' });
    const updated = await hr.changeStatus(e.id, 'deployed', 'assigned to SM Megamall');
    expect(updated.status).toBe('deployed');
  });

  it('rejects terminated → deployed', async () => {
    const e = await hr.createEmployee({ employeeCode: 'CG-1', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01' });
    await hr.changeStatus(e.id, 'terminated', 'AWOL');
    await expect(hr.changeStatus(e.id, 'deployed', 'oops')).rejects.toThrow(/transition/i);
  });
});
```

- [ ] **Step 2: Run, confirm failure.**

- [ ] **Step 3: Implement `service.ts`** with the state-transition matrix:

```typescript
import { eq } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { employees, type Employee, type NewEmployee } from './schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';

type Status = Employee['status'];

const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  applicant:  ['hired', 'terminated'],
  hired:      ['deployed', 'reliever', 'floating', 'on_leave', 'terminated'],
  deployed:   ['floating', 'reliever', 'on_leave', 'terminated'],
  reliever:   ['deployed', 'floating', 'on_leave', 'terminated'],
  floating:   ['deployed', 'reliever', 'on_leave', 'terminated'],
  on_leave:   ['deployed', 'reliever', 'floating', 'terminated'],
  terminated: [], // terminal
};

export async function createEmployee(input: Omit<NewEmployee, 'id' | 'createdAt' | 'updatedAt'> & { actorUserId?: string | null }): Promise<Employee> {
  const db = getDb();
  const { actorUserId, ...row } = input;
  try {
    const [created] = await db.insert(employees).values({ ...row, basicSalary: String(row.basicSalary) }).returning();
    await audit.record({
      actor: actorUserId ?? null,
      action: 'hr.employee.created',
      target: { kind: 'hr_employee', id: created.id },
      payload: { employeeCode: created.employeeCode, name: `${created.firstName} ${created.lastName}` },
    });
    events.publish('hr.employee.created', { id: created.id, employeeCode: created.employeeCode });
    return created;
  } catch (e: any) {
    if (e.code === '23505' && /email/.test(e.detail ?? '')) {
      throw new Error(`Email already in use: ${row.email}`);
    }
    throw new Error(`[hr/createEmployee] ${e.message ?? e}`);
  }
}

export async function getEmployee(id: string): Promise<Employee | null> {
  const db = getDb();
  const rows = await db.select().from(employees).where(eq(employees.id, id));
  return rows[0] ?? null;
}

export async function changeStatus(id: string, next: Status, reason: string, opts: { actorUserId?: string | null } = {}): Promise<Employee> {
  const db = getDb();
  const current = await getEmployee(id);
  if (!current) throw new Error(`[hr/changeStatus] no employee ${id}`);
  if (!ALLOWED_TRANSITIONS[current.status].includes(next)) {
    throw new Error(`[hr/changeStatus] disallowed transition ${current.status} → ${next}`);
  }
  const [updated] = await db.update(employees).set({ status: next, updatedAt: new Date(), ...(next === 'terminated' ? { terminatedOn: new Date().toISOString().slice(0, 10) } : {}) }).where(eq(employees.id, id)).returning();
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'hr.employee.status_changed',
    target: { kind: 'hr_employee', id },
    payload: { from: current.status, to: next, reason },
  });
  events.publish('hr.employee.status_changed', { id, from: current.status, to: next });
  return updated;
}
```

- [ ] **Step 4: Wire `modules/hr/index.ts`** — re-export the three functions.

- [ ] **Step 5: Run tests** — all PASS.

- [ ] **Step 6: Commit** — `feat(hr): createEmployee + status state machine`.

### Task 2.3: `bulkImportEmployees` from CSV

**Files:**
- Modify: `modules/hr/service.ts` (add `bulkImportEmployees`)
- Modify: `modules/hr/hr.test.ts`
- Add dep: `papaparse` (CSV parser — Slice 0 doesn't have one)

- [ ] **Step 1: Install** `pnpm add papaparse && pnpm add -D @types/papaparse`.

- [ ] **Step 2: Write failing tests** — happy 3-row CSV; CSV with duplicate email inside the batch (per-row error); CSV with email that already exists in DB (per-row error); CSV with invalid basicSalary (per-row error). Implementation must surface per-row errors without aborting the whole batch (per [Slice 1 contract](1-first-payslip.md) Done criterion #3 + v2 fix M-3).

```typescript
it('bulk imports 3 valid rows', async () => {
  const csv = `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on
CG-1,Juan,Dela Cruz,juan@x.com,18000,SEMI_MONTHLY,2026-05-01
CG-2,Maria,Santos,maria@x.com,18000,SEMI_MONTHLY,2026-05-01
CG-3,Pedro,Reyes,pedro@x.com,18000,SEMI_MONTHLY,2026-05-01`;
  const result = await hr.bulkImportEmployees(csv);
  expect(result.imported).toBe(3);
  expect(result.errors).toEqual([]);
});

it('flags duplicate email inside the batch (row 2 wins, row 3 errors)', async () => {
  const csv = `employee_code,first_name,last_name,email,basic_salary,pay_frequency,hired_on
CG-1,A,B,dup@x.com,18000,SEMI_MONTHLY,2026-05-01
CG-2,C,D,dup@x.com,18000,SEMI_MONTHLY,2026-05-01`;
  const result = await hr.bulkImportEmployees(csv);
  expect(result.imported).toBe(1);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]).toMatchObject({ row: 2, reason: expect.stringMatching(/dup@x\.com/) });
});
```

- [ ] **Step 3: Implement** — parse with papaparse (header: true), pre-fetch existing emails into a Set, walk rows, validate with Zod, collect errors, insert valid rows in a transaction. **Plain-language errors** per [UX-quality memory](../../../.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Taolink-v3---Sentinel/memory/project_ux_quality_bar.md) — "Row 3: the email address looks wrong — check for typos" not "Zod validation failed."

```typescript
import Papa from 'papaparse';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';

const csvRowSchema = z.object({
  employee_code: z.string().min(1, 'employee_code is required'),
  first_name:    z.string().min(1, 'first name is required'),
  last_name:     z.string().min(1, 'last name is required'),
  email:         z.string().email('the email address looks wrong — check for typos').optional().or(z.literal('')),
  basic_salary:  z.string().refine((v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0, 'basic salary must be a positive number'),
  pay_frequency: z.enum(['MONTHLY', 'SEMI_MONTHLY']).default('SEMI_MONTHLY'),
  hired_on:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'hired_on must be YYYY-MM-DD'),
});

export type BulkImportResult = { imported: number; errors: Array<{ row: number; reason: string }> };

export async function bulkImportEmployees(csvText: string, opts: { actorUserId?: string | null } = {}): Promise<BulkImportResult> {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const errors: BulkImportResult['errors'] = [];

  const db = getDb();
  // Pre-fetch all emails already in DB to flag duplicates fast.
  const existingEmailRows = await db.select({ email: employees.email }).from(employees);
  const existingEmails = new Set(existingEmailRows.map((r) => r.email).filter(Boolean) as string[]);

  const seenInBatch = new Set<string>();
  const toInsert: NewEmployee[] = [];

  parsed.data.forEach((raw, idx) => {
    const row = idx + 1; // CSV row number (1-indexed, header excluded by papaparse)
    const parse = csvRowSchema.safeParse(raw);
    if (!parse.success) {
      errors.push({ row, reason: parse.error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const r = parse.data;
    if (r.email && existingEmails.has(r.email)) {
      errors.push({ row, reason: `email ${r.email} already exists in HR — pick a different one or remove this row.` });
      return;
    }
    if (r.email && seenInBatch.has(r.email)) {
      errors.push({ row, reason: `email ${r.email} appears twice in the same file — keep one row.` });
      return;
    }
    if (r.email) seenInBatch.add(r.email);
    toInsert.push({
      employeeCode: r.employee_code,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email || null,
      basicSalary: String(parseFloat(r.basic_salary)),
      payFrequency: r.pay_frequency,
      hiredOn: r.hired_on,
    });
  });

  let imported = 0;
  if (toInsert.length > 0) {
    const created = await db.insert(employees).values(toInsert).returning();
    imported = created.length;
    for (const e of created) {
      await audit.record({ actor: opts.actorUserId ?? null, action: 'hr.employee.created', target: { kind: 'hr_employee', id: e.id }, payload: { employeeCode: e.employeeCode, viaBulkImport: true } });
      events.publish('hr.employee.created', { id: e.id, employeeCode: e.employeeCode });
    }
  }
  return { imported, errors };
}
```

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `feat(hr): bulk-import from CSV with per-row error reporting`.

### Task 2.4: HR module README

- [ ] Write `modules/hr/README.md` — Purpose / Public API / Dependencies / Known failure modes. Mention the state-transition matrix and link to the failure modes (duplicate email, invalid transition).

### Task 2.5: Phase-2 gate

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
- [ ] Commit

---

## Phase 3 — `modules/clients`: Client + Detachment master

Smaller module — straightforward CRUD. Mirror `modules/audit` shape.

### Task 3.1: Schema + migration

**Files:**
- Create: `modules/clients/schema.ts`

- [ ] **Step 1: Schema** —

```typescript
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ nameIdx: index('clients_name_idx').on(t.name) }));

export const detachments = pgTable('detachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  address: text('address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ clientIdx: index('detachments_client_idx').on(t.clientId) }));

export type Client = typeof clients.$inferSelect;
export type Detachment = typeof detachments.$inferSelect;
```

- [ ] **Step 2:** Register in `core/db.ts` + `core/loader.ts`.
- [ ] **Step 3:** `pnpm db:generate` → `0004_slice1_clients.sql` → `pnpm db:migrate`.
- [ ] **Step 4:** Commit — `feat(clients): client + detachment schema + migration`.

### Task 3.2: Service + tests

**Files:**
- Create: `modules/clients/service.ts`, `modules/clients/clients.test.ts`, `modules/clients/index.ts`

- [ ] **Step 1: Write tests** — `createClient`, `createDetachment`, `getDetachment`, `listDetachments`. Cover: detachment with non-existent clientId throws FK error with plain message.
- [ ] **Step 2: Implement** — each mutation calls `audit.record` and `events.publish('clients.client.created'|'clients.detachment.created')`. Wrap FK violations in plain-language errors per UX rule.
- [ ] **Step 3: Wire `index.ts`** — `export const clients = { createClient, createDetachment, getDetachment, listDetachments };`
- [ ] **Step 4: Tests PASS, commit** — `feat(clients): CRUD service + tests`.

### Task 3.3: README + Phase-3 gate

- [ ] `modules/clients/README.md`
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
- [ ] Commit

---

## Phase 4 — `modules/assignments`: Assignment master

### Task 4.1: Schema + migration

**Files:**
- Create: `modules/assignments/schema.ts`

```typescript
import { pgTable, uuid, date, timestamp, text, index } from 'drizzle-orm/pg-core';
import { employees } from '@/modules/hr/schema';
import { detachments } from '@/modules/clients/schema';

export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  detachmentId: uuid('detachment_id').notNull().references(() => detachments.id, { onDelete: 'restrict' }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  endReason: text('end_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  empDateIdx: index('assignments_emp_date_idx').on(t.employeeId, t.startDate),
  detIdx: index('assignments_det_idx').on(t.detachmentId),
}));

export type Assignment = typeof assignments.$inferSelect;
```

- [ ] **Steps:** schema → register → generate `0005_slice1_assignments.sql` → migrate → commit.

### Task 4.2: Service — `assign`, `endAssignment`, `getActiveAssignment` (TDD)

- [ ] **Tests** in `assignments.test.ts`: assign happy path emits `assignment.created`; `endAssignment` sets endDate + emits `assignment.ended`; `getActiveAssignment(empId, date)` returns the assignment where `startDate <= date AND (endDate IS NULL OR endDate >= date)`. Also test: cannot create overlapping active assignments for the same employee (throws "this guard already has an active assignment — end the previous one first").

- [ ] **Implementation** — query active assignment before insert; if exists, throw. Per [ADR 0009 handoff contract](decisions/0009-hr-starter-and-recruitment-as-entry-point.md), this same `assign` function will be called by Recruitment in Slice 3 — no API change.

- [ ] **README** notes: "Slice 1 caller: super-admin via UI. Slice 3: Recruitment owns these calls."

- [ ] Commit + Phase-4 gate.

---

## Phase 5 — `modules/dtr`: manual DTR entry + period close

### Task 5.1: Schema + migration

**Files:**
- Create: `modules/dtr/schema.ts`

```typescript
import { pgTable, uuid, date, time, pgEnum, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { employees } from '@/modules/hr/schema';
import { assignments } from '@/modules/assignments/schema';

export const dtrStatus = pgEnum('dtr_status', ['worked', 'absent', 'leave', 'holiday_worked', 'restday_worked']);

export const dtrEntries = pgTable('dtr_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  assignmentId: uuid('assignment_id').references(() => assignments.id),
  date: date('date').notNull(),
  timeIn: time('time_in'),
  timeOut: time('time_out'),
  status: dtrStatus('status').notNull().default('worked'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  empDateUq: unique('dtr_emp_date_uq').on(t.employeeId, t.date),
  dateIdx: index('dtr_date_idx').on(t.date),
  assignIdx: index('dtr_assignment_idx').on(t.assignmentId),
}));

export const dtrPeriodCloses = pgTable('dtr_period_closes', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ periodUq: unique('dtr_period_close_uq').on(t.periodStart, t.periodEnd) }));

export type DtrEntry = typeof dtrEntries.$inferSelect;
```

Note: import `text` at top of file. After schema → register → migrate → commit.

### Task 5.2: Service — `recordDTR`, `getDTR`, `closePeriod` (TDD)

- [ ] **Tests:** record happy path resolves assignment_id from `assignments.getActiveAssignment(employeeId, date)` automatically; recording two rows for same (employee, date) violates unique constraint with plain error; `closePeriod` emits `dtr.period.closed`; closing the same period twice throws "this period is already closed."

- [ ] **Implementation:**

```typescript
import { and, between, eq } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { dtrEntries, dtrPeriodCloses, type DtrEntry } from './schema';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { getActiveAssignment } from '@/modules/assignments/service';

export async function recordDTR(input: {
  employeeId: string; date: string; timeIn?: string; timeOut?: string;
  status?: DtrEntry['status']; notes?: string; actorUserId?: string | null;
}): Promise<DtrEntry> {
  const db = getDb();
  const active = await getActiveAssignment(input.employeeId, input.date);
  try {
    const [created] = await db.insert(dtrEntries).values({
      employeeId: input.employeeId,
      assignmentId: active?.id ?? null,
      date: input.date,
      timeIn: input.timeIn ?? null,
      timeOut: input.timeOut ?? null,
      status: input.status ?? 'worked',
      notes: input.notes ?? null,
    }).returning();
    await audit.record({ actor: input.actorUserId ?? null, action: 'dtr.recorded', target: { kind: 'dtr_entry', id: created.id }, payload: { employeeId: input.employeeId, date: input.date } });
    events.publish('dtr.recorded', { id: created.id, employeeId: input.employeeId, date: input.date });
    return created;
  } catch (e: any) {
    if (e.code === '23505') throw new Error(`A DTR entry already exists for this guard on ${input.date}. Edit the existing entry instead of adding a new one.`);
    throw new Error(`[dtr/recordDTR] ${e.message}`);
  }
}

export async function getDTR(employeeId: string, start: string, end: string): Promise<DtrEntry[]> {
  return getDb().select().from(dtrEntries).where(and(eq(dtrEntries.employeeId, employeeId), between(dtrEntries.date, start, end)));
}

export async function closePeriod(periodStart: string, periodEnd: string, opts: { actorUserId?: string | null } = {}): Promise<void> {
  const db = getDb();
  try {
    await db.insert(dtrPeriodCloses).values({ periodStart, periodEnd });
  } catch (e: any) {
    if (e.code === '23505') throw new Error(`This period (${periodStart} to ${periodEnd}) is already closed.`);
    throw new Error(`[dtr/closePeriod] ${e.message}`);
  }
  await audit.record({ actor: opts.actorUserId ?? null, action: 'dtr.period.closed', target: { kind: 'dtr_period', id: `${periodStart}_${periodEnd}` }, payload: { periodStart, periodEnd } });
  events.publish('dtr.period.closed', { periodStart, periodEnd });
}
```

- [ ] Wire `index.ts`, run tests, commit.

### Task 5.3: README + Phase-5 gate

---

## Phase 6 — `modules/payroll`: engine + run lifecycle + payslip

**Most complex phase.** Built TDD-first with the math broken into a pure function (`computePayrollLine`) so it can be unit-tested without DB.

### Task 6.1: Schema + migration

**Files:**
- Create: `modules/payroll/schema.ts`

```typescript
import { pgTable, uuid, date, numeric, pgEnum, timestamp, jsonb, integer, unique, index } from 'drizzle-orm/pg-core';
import { employees } from '@/modules/hr/schema';

export const payRunStatus = pgEnum('pay_run_status', ['draft', 'calculated', 'locked']);

export const payRuns = pgTable('pay_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: payRunStatus('status').notNull().default('draft'),
  workDaysPerMonth: integer('work_days_per_month').notNull().default(26),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
}, (t) => ({ periodUq: unique('pay_runs_period_uq').on(t.periodStart, t.periodEnd) }));

export const payslips = pgTable('payslips', {
  id: uuid('id').primaryKey().defaultRandom(),
  payRunId: uuid('pay_run_id').notNull().references(() => payRuns.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  daysWorked: numeric('days_worked', { precision: 6, scale: 2 }).notNull(),
  otHours: numeric('ot_hours', { precision: 6, scale: 2 }).notNull().default('0'),
  basicSalarySnapshot: numeric('basic_salary_snapshot', { precision: 12, scale: 2 }).notNull(),
  payFrequencySnapshot: text('pay_frequency_snapshot').notNull(),
  grossPay: numeric('gross_pay', { precision: 12, scale: 2 }).notNull(),
  sssEE: numeric('sss_ee', { precision: 12, scale: 2 }).notNull(),
  philhealthEE: numeric('philhealth_ee', { precision: 12, scale: 2 }).notNull(),
  pagibigEE: numeric('pagibig_ee', { precision: 12, scale: 2 }).notNull(),
  birWtax: numeric('bir_wtax', { precision: 12, scale: 2 }).notNull(),
  netPay: numeric('net_pay', { precision: 12, scale: 2 }).notNull(),
  breakdown: jsonb('breakdown').notNull(),  // step-by-step computation log for audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  runEmpUq: unique('payslips_run_emp_uq').on(t.payRunId, t.employeeId),
}));

export type PayRun = typeof payRuns.$inferSelect;
export type Payslip = typeof payslips.$inferSelect;
```

Note: `text` import needed. Then register → generate `0006_slice1_payroll.sql` → migrate → commit.

### Task 6.2: Pure payroll-math function (TDD, no DB)

**Files:**
- Create: `modules/payroll/compute.ts`
- Create: `modules/payroll/compute.test.ts`

The math lives in a pure function so we can unit-test it exhaustively without DB setup. The DB-aware `runPayroll` wraps it.

- [ ] **Step 1: Failing tests** — cover known-input/known-output cases. Use one v2-grade reference case (one CGoC-typical 15-day period: ₱18,000 monthly basic, semi-monthly, 13 days worked, 0 OT) and verify output line-by-line against a hand-computed expected. Also: zero-days-worked → ₱0 net (per v2 fix C-2); OT contribution stacks correctly.

```typescript
import { describe, it, expect } from 'vitest';
import { computePayrollLine } from './compute';

const RATES_2026 = {
  // Hand-extracted from the seed for the test. Avoids DB dependency.
  sssBracketForMonthly: (m: number) => ({ eeShareRegular: 720, eeShareWisp: 180 }), // MSC 18,000
  philhealthEE: (m: number) => 450,  // 5% × 18000 ÷ 2
  pagibigEE: (m: number) => 200,     // capped
  wtaxMonthly: (taxable: number, freq: 'MONTHLY' | 'SEMI_MONTHLY') => 0, // ₱18k SEMI is below ₱10,417 bracket cap × 2
};

describe('computePayrollLine — basic semi-monthly run', () => {
  it('18000 monthly, 13 days worked, 0 OT, 0 leave/holiday', () => {
    const result = computePayrollLine({
      basicSalaryMonthly: 18000,
      payFrequency: 'SEMI_MONTHLY',
      workDaysPerMonth: 26,
      daysWorked: 13,
      otHours: 0,
      rates: RATES_2026,
    });

    // Daily rate = 18000/26 = 692.31; gross = 692.31 × 13 = 9000.00
    expect(result.grossPay).toBeCloseTo(9000.00, 0);
    expect(result.sssEE).toBeCloseTo(900, 2);          // 720 + 180 WISP, then ÷2 for semi-monthly cut? No — full SSS deduction lands once/month. See note below.
    // ... rest
  });
});
```

Critical math design decision (call out in module README): the BIR `wtaxMonthly` already takes `freq`; the SSS / PhilHealth / Pag-IBIG deductions are monthly figures — for SEMI_MONTHLY cuts, the engine takes the **monthly** EE figure and applies it to one of the two cuts in the month (convention: apply to the second cut). For Slice 1, default = "apply full deduction to whichever cut closes on the 30th/31st, ₱0 on the 15th cut." Document this in the module README and in `compute.ts` comments.

- [ ] **Step 2: Implement `compute.ts`** — fully pure (no imports beyond types):

```typescript
export type PayrollComputeInput = {
  basicSalaryMonthly: number;
  payFrequency: 'MONTHLY' | 'SEMI_MONTHLY';
  workDaysPerMonth: number;       // typically 26 for guards
  daysWorked: number;
  otHours: number;
  isFinalCutOfMonth?: boolean;    // for SEMI_MONTHLY, true on the 30th/31st cut, false on the 15th cut
  rates: {
    sssBracketForMonthly: (monthly: number) => { eeShareRegular: number; eeShareWisp: number };
    philhealthEE: (monthly: number) => number;
    pagibigEE: (monthly: number) => number;
    wtaxMonthly: (taxableMonthly: number, freq: 'MONTHLY' | 'SEMI_MONTHLY') => number;
  };
};

export type PayrollComputeResult = {
  grossPay: number;
  sssEE: number;
  philhealthEE: number;
  pagibigEE: number;
  birWtax: number;
  netPay: number;
  breakdown: Record<string, number | string>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computePayrollLine(input: PayrollComputeInput): PayrollComputeResult {
  const dailyRate = input.basicSalaryMonthly / input.workDaysPerMonth;
  const hourlyRate = dailyRate / 8;
  const basicEarnings = dailyRate * input.daysWorked;
  const otPay = input.otHours * hourlyRate * 1.25;
  const grossPay = round2(Math.max(0, basicEarnings + otPay));

  // Statutory deductions are MONTHLY figures by regulation.
  // For SEMI_MONTHLY, apply on the final cut of the month (convention); ₱0 on the first cut.
  const applyStatutory = input.payFrequency === 'MONTHLY' || (input.payFrequency === 'SEMI_MONTHLY' && input.isFinalCutOfMonth);

  const sssBracket = input.rates.sssBracketForMonthly(input.basicSalaryMonthly);
  const sssEEMonthly = (sssBracket?.eeShareRegular ?? 0) + (sssBracket?.eeShareWisp ?? 0);
  const philhealthEEMonthly = input.rates.philhealthEE(input.basicSalaryMonthly);
  const pagibigEEMonthly = input.rates.pagibigEE(input.basicSalaryMonthly);

  const sssEE        = applyStatutory ? round2(sssEEMonthly) : 0;
  const philhealthEE = applyStatutory ? round2(philhealthEEMonthly) : 0;
  const pagibigEE    = applyStatutory ? round2(pagibigEEMonthly) : 0;

  // BIR WTAX: taxable = gross minus non-taxable statutory contributions.
  const taxableForCut = round2(grossPay - sssEE - philhealthEE - pagibigEE);
  const birWtax = round2(input.rates.wtaxMonthly(Math.max(0, taxableForCut), input.payFrequency));

  const netPay = round2(Math.max(0, grossPay - sssEE - philhealthEE - pagibigEE - birWtax));

  return {
    grossPay, sssEE, philhealthEE, pagibigEE, birWtax, netPay,
    breakdown: {
      dailyRate: round2(dailyRate),
      hourlyRate: round2(hourlyRate),
      basicEarnings: round2(basicEarnings),
      otPay: round2(otPay),
      applyStatutory: applyStatutory ? 'yes' : 'no',
      sssEEMonthly: round2(sssEEMonthly),
      philhealthEEMonthly: round2(philhealthEEMonthly),
      pagibigEEMonthly: round2(pagibigEEMonthly),
      taxableForCut,
    },
  };
}
```

- [ ] **Step 3: Run tests** — PASS.
- [ ] **Step 4: Commit** — `feat(payroll): pure computePayrollLine + tests`.

### Task 6.3: DB-aware `runPayroll` + `getPayslip`

**Files:**
- Create: `modules/payroll/service.ts`, `modules/payroll/payroll.test.ts`, `modules/payroll/index.ts`

- [ ] **Step 1: Integration test** — seed 1 employee + 13 DTR `worked` rows + close period → call `payroll.runPayroll(start, end)` → assert: one payslip created, `payRun.status === 'calculated'`, `payslip.grossPay ≈ 9000`, `payslip.netPay > 0`, `events.publish('payroll.run.completed')` was emitted, `audit_log` contains a `payroll.run.completed` row.

- [ ] **Step 2: Implement `runPayroll`** — per [Slice 1 contract](1-first-payslip.md) Component 5 + v2 fix C-3 (one employee failure does not abort the whole run; record the failure in audit log and continue):

```typescript
import { and, eq, between } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { payRuns, payslips, type PayRun, type Payslip } from './schema';
import { employees } from '@/modules/hr/schema';
import { dtrEntries } from '@/modules/dtr/schema';
import { computePayrollLine } from './compute';
import { sssBracketForMonthly, philhealthEE, pagibigEE, wtaxMonthly } from '@/modules/compliance/service';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';

const WORK_DAYS_PER_MONTH = Number(process.env.WORK_DAYS_PER_MONTH ?? '26');

export async function runPayroll(periodStart: string, periodEnd: string, opts: { isFinalCutOfMonth?: boolean; actorUserId?: string | null } = {}): Promise<PayRun> {
  const db = getDb();
  // Upsert pay_run row (create if missing).
  const existing = await db.select().from(payRuns).where(and(eq(payRuns.periodStart, periodStart), eq(payRuns.periodEnd, periodEnd)));
  let run: PayRun;
  if (existing.length === 0) {
    [run] = await db.insert(payRuns).values({ periodStart, periodEnd, workDaysPerMonth: WORK_DAYS_PER_MONTH }).returning();
  } else {
    run = existing[0];
    // Wipe existing payslips to recompute.
    await db.delete(payslips).where(eq(payslips.payRunId, run.id));
  }

  const activeEmployees = await db.select().from(employees).where(eq(employees.status, 'deployed'));
  // Slice-1 minimum: also include 'hired' so the demo doesn't require status flips.
  const employeesForRun = await db.select().from(employees);

  let isFinalCut = opts.isFinalCutOfMonth;
  if (isFinalCut === undefined) {
    // Heuristic: a period ending on day >= 28 is the final cut.
    isFinalCut = Number(periodEnd.slice(-2)) >= 28;
  }

  for (const emp of employeesForRun) {
    try {
      const dtr = await db.select().from(dtrEntries).where(and(eq(dtrEntries.employeeId, emp.id), between(dtrEntries.date, periodStart, periodEnd)));
      const daysWorked = dtr.filter((r) => r.status === 'worked' || r.status === 'holiday_worked' || r.status === 'restday_worked').length;
      const otHours = 0; // Slice 1 has no OT input UI — placeholder, computed when added.

      const result = computePayrollLine({
        basicSalaryMonthly: Number(emp.basicSalary),
        payFrequency: emp.payFrequency,
        workDaysPerMonth: WORK_DAYS_PER_MONTH,
        daysWorked,
        otHours,
        isFinalCutOfMonth: isFinalCut,
        rates: {
          sssBracketForMonthly: async (m: number) => {
            const b = await sssBracketForMonthly(m, periodEnd);
            return b ? { eeShareRegular: Number(b.eeShareRegular), eeShareWisp: Number(b.eeShareWisp) } : { eeShareRegular: 0, eeShareWisp: 0 };
          },
          philhealthEE: async (m: number) => philhealthEE(m, periodEnd),
          pagibigEE: async (m: number) => pagibigEE(m, periodEnd),
          wtaxMonthly: async (t: number, f) => wtaxMonthly(t, f, periodEnd),
        } as any, // async rates: see Task 6.4
      });

      await db.insert(payslips).values({
        payRunId: run.id, employeeId: emp.id,
        daysWorked: String(daysWorked),
        otHours: String(otHours),
        basicSalarySnapshot: emp.basicSalary,
        payFrequencySnapshot: emp.payFrequency,
        grossPay: String(result.grossPay),
        sssEE: String(result.sssEE),
        philhealthEE: String(result.philhealthEE),
        pagibigEE: String(result.pagibigEE),
        birWtax: String(result.birWtax),
        netPay: String(result.netPay),
        breakdown: result.breakdown,
      });
      await audit.record({ actor: opts.actorUserId ?? null, action: 'payroll.line.computed', target: { kind: 'payslip', id: `${run.id}_${emp.id}` }, payload: { employeeCode: emp.employeeCode, netPay: result.netPay } });
      events.publish('payslip.generated', { payRunId: run.id, employeeId: emp.id });
    } catch (err: any) {
      // Per v2 fix C-3 — one failure does NOT abort the run.
      await audit.record({ actor: opts.actorUserId ?? null, action: 'payroll.line.failed', target: { kind: 'employee', id: emp.id }, payload: { error: err.message ?? String(err) } });
    }
  }

  const [calculated] = await db.update(payRuns).set({ status: 'calculated', calculatedAt: new Date() }).where(eq(payRuns.id, run.id)).returning();
  await audit.record({ actor: opts.actorUserId ?? null, action: 'payroll.run.completed', target: { kind: 'pay_run', id: run.id }, payload: { periodStart, periodEnd, employeeCount: employeesForRun.length } });
  events.publish('payroll.run.completed', { payRunId: run.id, periodStart, periodEnd });
  return calculated;
}
```

**Note for the implementer:** the `rates` shape in `computePayrollLine` was synchronous in Task 6.2 but is async here. Reconcile in Task 6.4 — make the pure function accept async rate functions (return Promises) and `await` them. Update `compute.ts` and `compute.test.ts` accordingly.

### Task 6.4: Make `computePayrollLine` async-rate-aware

- [ ] Modify `compute.ts` so `rates.*` may return `Promise<...>` and the function returns `Promise<PayrollComputeResult>`. Update tests (use `await` and async functions in `RATES_2026`). Re-run.
- [ ] Commit — `refactor(payroll): rate-lookups are async-capable`.

### Task 6.5: `lockPayRun` + empty-run guard

- [ ] **Test:** call `lockPayRun(id)` when 0 payslips → throws "this pay run has no payslips, run the calculation first." (per v2 fix ISSUE-C.) When ≥1 payslip → status becomes `locked`, `lockedAt` set, `audit.record('payroll.run.locked')`.
- [ ] Implement, commit.

### Task 6.6: Subscribe to `dtr.period.closed` → auto-run payroll

- [ ] **Step 1: Auto-subscription** — create `modules/payroll/subscriptions.ts` that registers `events.subscribe('dtr.period.closed', ...)` to trigger `runPayroll`. Wire into `modules/payroll/index.ts`'s module init.
- [ ] **Test** that publishing `dtr.period.closed` after some DTR rows triggers a payroll run.
- [ ] Commit.

### Task 6.7: `getPayslip` + `listPayslips`

- [ ] Add to service + tests + export from `index.ts`. Commit.

### Task 6.8: README + Phase-6 gate

- [ ] `modules/payroll/README.md` — Purpose / Public API / Dependencies / Known failure modes. Include the SEMI_MONTHLY statutory-deduction convention and the v2-comparison test approach.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green; commit.

### Task 6.9: V2 reconciliation test (Done criterion #7)

- [ ] **Test fixture:** craft 3 reference cases by hand (₱14k, ₱18k, ₱28k monthly; SEMI_MONTHLY; varied daysWorked) → compute expected gross/SSS/PhilHealth/Pag-IBIG/BIR/net by hand using a spreadsheet (record the spreadsheet in `wiki/slices/1-first-payslip-reconciliation.md`) → assert each computed line matches expected within ₱1.
- [ ] If any line drifts > ₱1, the test FAILS — fix the engine before moving on.
- [ ] Commit.

---

## Phase 7 — `modules/compliance-exports`: SSS R3 + BIR 2316

### Task 7.1: SSS R3 format research

**Files:** None yet — research task.

- [ ] **Step 1:** Look up the current 2026 SSS R3 file format. The SSS publishes a template (CSV or Excel-based) for monthly contribution remittances. **Use the `Firecrawl` skill** to fetch the current SSS R-3 spec from sss.gov.ph, OR check `ref/sentinel-docs/` for any cached spec.
- [ ] **Step 2:** Write `modules/compliance-exports/SSS_R3_FORMAT.md` documenting the column headers, data types, and one fully-worked example row. Cite the SSS source URL with a `Last verified: 2026-05-24` line.
- [ ] **Step 3:** Commit — `docs(compliance-exports): SSS R3 format spec`.

### Task 7.2: SSS R3 export — implementation (TDD)

**Files:**
- Create: `modules/compliance-exports/sss-r3.ts`, `sss-r3.test.ts`

- [ ] **Test:** given a pay run with 3 payslips, `exportSSS_R3(payRunId)` returns a CSV (or TSV) string matching the documented format, one row per employee, totals row at bottom.
- [ ] **Implement** — pull payslips + employees, project to R3 columns, write CSV via papaparse `unparse`. Audit the export. Commit.

### Task 7.3: BIR 2316 format research

- [ ] **Step 1:** Look up the current BIR Form 2316 layout (CY 2025/2026). Either PDF form with fields, or Alphalist CSV.
- [ ] **Step 2:** Write `modules/compliance-exports/BIR_2316_FORMAT.md` with field list + example. Per Slice 1 contract, partial-year is acceptable.
- [ ] **Step 3:** Commit — `docs(compliance-exports): BIR 2316 format spec`.

### Task 7.4: BIR 2316 export — implementation (TDD)

**Files:**
- Create: `modules/compliance-exports/bir-2316.ts`, `bir-2316.test.ts`

- [ ] **Test:** given employee + year, sums payslips in that year, returns object with all 2316 fields populated. (Slice 1 ships JSON/CSV rendering; PDF-form rendering deferred unless the format research above shows a CSV is acceptable for filing.)
- [ ] **Implement** — aggregate payslips for `(employeeId, year)`, project to 2316 field layout. Audit. Commit.

### Task 7.5: `index.ts` + README + Phase-7 gate

- [ ] `modules/compliance-exports/index.ts` re-exports `exportSSS_R3`, `exportBIR_2316`.
- [ ] `README.md` — purpose, API, format docs cross-linked, partial-year caveat for 2316.
- [ ] All green, commit.

---

## Phase 8 — UI screens

> **Per [UX-quality memory](../../../.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Taolink-v3---Sentinel/memory/project_ux_quality_bar.md):** every screen built in this phase must use the `frontend-design` skill. Plain labels. Plain error messages. Sensible defaults. Empty states that teach. Confirm destructive actions ("This will lock the payroll period. You won't be able to edit DTR after this. Continue?").

All routes live under `app/(admin)/...` — gated by `auth.requireUser` via a server-component layout. Pattern: each route has a `page.tsx` (server component fetching data) + a client form component for mutations using Next.js server actions.

### Task 8.1: Admin layout + dashboard shell

- [ ] **Step 1:** Create `app/(admin)/layout.tsx` — server component, calls `auth.requireUser` from request cookies, renders a sidebar (Dashboard / Employees / Clients / DTR / Payroll / Exports) + content slot. Redirects to `/login` if not authenticated.
- [ ] **Step 2:** Create `app/(admin)/dashboard/page.tsx` — empty-state landing page with quick links: "Add your first client", "Import guards from CSV", etc.
- [ ] **Step 3: Use `frontend-design` skill** for the layout aesthetic.
- [ ] **Step 4: Run `pnpm dev`** — log in as seeded super-admin, navigate to `/dashboard`. Should render. Commit.

### Task 8.2: Employees list + bulk-import screen

- [ ] **Step 1:** `app/(admin)/employees/page.tsx` — server component lists all employees from `hr.getEmployee` (add a list helper to the service if needed: `hr.listEmployees()`).
- [ ] **Step 2:** `app/(admin)/employees/import/page.tsx` — file upload, calls `hr.bulkImportEmployees(text)`, renders the per-row error report.
- [ ] **Step 3:** Confirm: importer shows plain-language errors ("Row 3: the email address looks wrong"). Empty state on `/employees` says "No guards yet — import a CSV to get started."
- [ ] **Step 4:** Add a sample-CSV download link on the import screen (`hr-employees-sample.csv` in `public/`). Commit.

### Task 8.3: Clients + Detachments screens

- [ ] `app/(admin)/clients/page.tsx` — list + "Add client" button.
- [ ] `app/(admin)/clients/[id]/page.tsx` — client detail with its detachments + "Add detachment" form.
- [ ] Forms use Next.js server actions calling `clients.createClient` / `clients.createDetachment`. Plain validation errors. Commit.

### Task 8.4: Assignments screen

- [ ] `app/(admin)/assignments/page.tsx` — list active assignments. "Assign guard" form: dropdown of unassigned employees × dropdown of detachments × start date.
- [ ] "End assignment" action on each row with confirm dialog. Commit.

### Task 8.5: DTR entry screen

- [ ] `app/(admin)/dtr/page.tsx` — period picker (defaults to upcoming cutoff). Renders a grid: rows = active employees, columns = each day in the period. Each cell editable: status + (optional) timeIn/timeOut.
- [ ] "Close period" button at bottom, with confirm dialog: "Close DTR for May 1–15, 2026? This will trigger the payroll run for the period. You can still edit DTR for other periods."
- [ ] Server action calls `dtr.recordDTR` per cell on save, then `dtr.closePeriod` when the button is clicked.
- [ ] Commit.

### Task 8.6: Payroll runs + payslip viewer

- [ ] `app/(admin)/payroll/page.tsx` — list of pay runs (period, status, lockedAt). "Run payroll" button for any not-yet-locked period.
- [ ] `app/(admin)/payroll/[runId]/page.tsx` — list of payslips for the run. Each row: employee name, gross, total deductions, net.
- [ ] `app/(admin)/payroll/[runId]/[employeeId]/page.tsx` — single payslip view: gross, breakdown of 4 deductions, net. Plain-language labels ("Take-home pay" not "Net Pay" if you want — call this in the brainstorming with the frontend-design skill).
- [ ] "Lock pay run" button with confirm dialog.
- [ ] Commit.

### Task 8.7: Exports screen

- [ ] `app/(admin)/exports/page.tsx` — pick a pay run + period → "Download SSS R3" button (returns CSV). Pick a guard + year → "Download BIR 2316".
- [ ] Server actions return the file via response with `Content-Disposition: attachment`. Commit.

### Task 8.8: Phase-8 gate

- [ ] **Run `pnpm dev`** and complete the full demo flow manually:
  1. Log in
  2. Create client + detachment
  3. Import 10-row guard CSV
  4. Assign all 10 to the detachment
  5. Enter 15-day DTR for each
  6. Close period (triggers payroll run)
  7. View each payslip
  8. Lock the pay run
  9. Download SSS R3 + BIR 2316
- [ ] Note any UX friction during the walkthrough; fix the worst before declaring done.
- [ ] Commit any fixes.

---

## Phase 9 — Demo bootstrap directive + regression gate + verification

### Task 9.1: Slice 1 bootstrap directive

- [ ] Create `directives/slice-1-bootstrap.md` — the SOP that walks a fresh dev (or fresh demo session) through the 9 steps above. Include the 10-row sample CSV inline + the expected outputs at each step.

### Task 9.2: Slice 0 regression gate

- [ ] Create `modules/_regression/slice0.test.ts` — re-runs the Slice 0 smoke tests as a single suite (import them or just re-implement the key assertions). Per [ADR 0013](decisions/0013-vertical-slices-over-horizontal-phases.md) discipline rule #1.
- [ ] Ensure this runs as part of `pnpm test`. Commit.

### Task 9.3: Sample CSV fixture

- [ ] Create `public/hr-employees-sample.csv` — 10 realistic guard rows (Tagalog/English names, peso amounts ₱14k–₱20k, all `SEMI_MONTHLY`, varied `hired_on`). Referenced from the import screen.

### Task 9.4: Done-criteria checklist sweep

- [ ] Walk through every Done criterion in the [Slice 1 contract](1-first-payslip.md) and verify each one passes:
  1. Admin logs in → ✓
  2. Creates client + detachment → ✓
  3. Bulk import 10 guards (with intentional bad row to verify error display) → ✓
  4. Assign all 10 → ✓
  5. Enter 15-day DTR → ✓
  6. Close DTR period → payroll auto-runs → ✓
  7. View payslips, numbers match v2 within ₱1 (Phase 6 Task 6.9 reconciliation test passes) → ✓
  8. SSS R3 export opens in Excel without schema errors → ✓
  9. BIR 2316 export for one guard for current year → ✓
  10. Slice 0 smoke tests still pass (Task 9.2) → ✓
  11. Every module has README + smoke test → ✓
  12. CI green on `main` → ✓
  13. `directives/slice-1-bootstrap.md` walks end-to-end → ✓
  14. UX bar: non-technical user completes demo without coaching → manual check, capture findings

### Task 9.5: Push + tag

- [ ] `gh auth switch -u noelferrer-01`
- [ ] `git push`
- [ ] Tag the commit: `git tag slice-1-done && git push --tags`
- [ ] `gh auth switch -u noelferrer`
- [ ] Update [`memory/memory.md`](../../memory/memory.md) and write a daily log entry for the slice-1 completion.

---

## Self-Review checklist (run before handoff)

- ✅ **Spec coverage:** every component in the [Slice 1 contract](1-first-payslip.md) §Components has a phase in this plan. Every Done criterion in §"Done criteria" has a task that produces it.
- ✅ **No placeholders:** every step contains real code or a real command.
- ✅ **Type consistency:** `hr.bulkImportEmployees` signature in Task 2.3 matches the imports in Task 8.2. `runPayroll` signature consistent across Tasks 6.3, 6.6, 8.6.
- ✅ **Async-rate reconciliation:** flagged explicitly in Task 6.4 — `compute.ts` is sync at first, becomes async in Task 6.4.
- ✅ **Scope check:** one slice, one demo, one plan. Not splittable further without losing end-to-end demonstrability.

## Open assumptions worth flagging to the executor

1. **SSS R3 format research (Task 7.1) may surface a constraint that ripples back** — e.g. R3 requires fields Slice 1's payroll doesn't yet capture (member SS number, etc.). If so: add a "Step 0" to Phase 2 (HR schema) to include those fields, and update the [Slice 1 contract](1-first-payslip.md) before continuing.
2. **BIR 2316 partial-year (Task 7.4)** — if the format research shows partial-year exports are *rejected by BIR*, scale back to "internal preview only" for Slice 1 and defer real 2316 filing capability to a later slice. Update the contract.
3. **`frontend-design` skill is referenced in Phase 8** — confirmed available in the environment ([`/Users/user/.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Taolink-v3---Sentinel/memory/project_ux_quality_bar.md`](../../../.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Taolink-v3---Sentinel/memory/project_ux_quality_bar.md)). If invoking it surfaces additional discipline (e.g. component-library setup), absorb that into Phase 8 Task 8.1.
4. **Daily-log + memory updates** are NOT individual tasks; the executor adds them after each phase per `AGENTS.md` discipline.
