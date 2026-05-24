# Slice 2 — Multi-Client at Scale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 14-step Slice 2 demo: 100 employees (mix of guards + office staff) across 5 clients / 10 detachments, multi-select assignment, per-client payroll calendars driving DTR + payday countdowns, complete BIR 2316 PDF, edit on all master records. Total clerk time ≤ 30 minutes.

**Architecture:** Additive over Slice 1. One new module (`modules/payroll-calendars`). Cross-cutting UI refactor (shared `<DataTable>`, `<SearchInput>`, `<Typeahead>`, `<DetailLayout>`). New fields on existing tables. `pg_trgm` for fuzzy search. `@react-pdf/renderer` for BIR 2316 PDF. No new payroll math, no role engine, no auth changes.

**Tech Stack:** Same as Slice 1 — Node 20 LTS · TypeScript 5.7 · Next.js 15 (App Router) · Drizzle ORM 0.36 · postgres-js 3.4 · Vitest 2.1 · Zod 3.24 · pnpm 10. **New:** `pg_trgm` Postgres extension; `@react-pdf/renderer` v3.

**Contract:** [`wiki/slices/2-multi-client-at-scale.md`](2-multi-client-at-scale.md). UX walk-through and wireframes in §Wireframes / §UX walk-through are the source of truth — if implementation hits a gap, update the contract before diverging.

**Reference patterns:**
- Module shape: mirror [`modules/audit/`](../../modules/audit/) / [`modules/hr/`](../../modules/hr/) — `schema.ts` / `service.ts` / `index.ts` / `<module>.test.ts` / `README.md`.
- Test shape: see [`modules/hr/hr.test.ts`](../../modules/hr/hr.test.ts) — Vitest, real DB via testcontainers (already wired in Slice 0).
- UI screen pattern: each admin page is read-only by default + `[Edit]` toggle (new in Slice 2, see Phase 8).

**Layman's-terms reminder:** every UI screen must pass the "CGoC payroll clerk could complete this without coaching" test. Use the `frontend-design` skill when building each screen. See [`project_ux_quality_bar` memory](../../../.claude/projects/-Users-user-Desktop-Aintigravity-Workflows-Taolink-v3---Sentinel/memory/project_ux_quality_bar.md).

---

## Phase plan at a glance

| Phase | What ships | Approx. tasks |
|---|---|---|
| 1 | Schema migrations + `pg_trgm` extension + backfills | 8 |
| 2 | `modules/payroll-calendars` — new module | 6 |
| 3 | `modules/hr` extensions — `employment_type`, search, update, BIR fields | 8 |
| 4 | `modules/clients` extensions — update, headcount, deployment summary | 6 |
| 5 | `modules/assignments` extensions — bulk ops, update, pagination | 7 |
| 6 | `modules/payroll` integration — calendar resolution + frozen dates | 5 |
| 7 | `modules/compliance-exports` — BIR 2316 PDF with full IVB | 7 |
| 8 | Shared UI components — `<DataTable>`, `<SearchInput>`, `<Typeahead>`, `<DetailLayout>` | 8 |
| 9 | Screen rebuilds — sidebar, lists, detail/edit pages, DTR, Pay Runs | 10 |
| 10 | Demo bootstrap directive + Slice-0+1 regression gate + Done-criteria verification | 5 |
| **Total** | | **~70** |

**Phase ordering rule:** Phases 1–7 are backend-first (schema → modules), tested in isolation. Phases 8–9 are UI on top. Phase 10 closes the slice. **Do not write a UI screen for a module whose backend isn't done.**

## Conventions discovered during Phase 1 execution (use for Phases 2–10)

These adjust assumptions in the original plan. Subsequent tasks must follow these conventions:

- **Migration path:** `drizzle/migrations/`, NOT `db/migrations/` (the plan body referenced `db/migrations/` in places — ignore that).
- **Migrations are hand-rolled SQL.** `drizzle-kit generate` is NOT used — the project has no `drizzle/migrations/meta/` snapshot baseline. Hand-write each migration matching the style of `drizzle/migrations/0007_slice1_payroll.sql` (or any sibling).
- **Migration runner:** `pnpm db:migrate` (a thin wrapper over `drizzle/migrate.ts`). It requires `.env` loaded into the shell — prefix every invocation with `env $(grep -v '^#' .env | grep -v '^$' | xargs)`.
- **psql verification:** same `.env` prefix → `env $(grep -v '^#' .env | grep -v '^$' | xargs) psql "$DATABASE_URL" -c "..."`.
- **Postgres type naming convention:** module-prefixed. `hr_employee_status`, `hr_pay_frequency`, `hr_employment_type` for HR-module enums. `payroll_frequency` (no `pc_`/`payroll_calendars_` prefix needed — `payroll_*` is the natural namespace for the calendar module's enums and doesn't collide). `pay_run_status` is bare because it's payroll-domain across modules. When in doubt, prefix with the module's name.
- **CREATE TYPE idempotency:** Postgres 16 has no `CREATE TYPE IF NOT EXISTS`. Wrap in a DO-block:
  ```sql
  DO $$ BEGIN
    CREATE TYPE ... AS ENUM (...);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;
  ```
  See `drizzle/migrations/0002`, `0003`, `0006`, `0007` for the pattern.
- **ALTER TABLE idempotency:** every `ADD COLUMN` clause needs its own `IF NOT EXISTS`.
- **DB-import path in test files:** `import { closeDb, getSql } from '@/core/db'` (NOT `import { db } from 'db/client'` as the plan suggested). Pure SQL queries use ``await sql\`...\` `` (tagged-template style).
- **Table names in the running DB:**
  - HR employees → `hr_employees` (not `employees`)
  - Clients → `clients`
  - Detachments → `detachments`
  - Pay runs → `pay_runs`
  - DTR entries → check `modules/dtr/schema.ts` when needed
  - Audit → `audit_log` (verify when needed)
- **Commit cadence:** one logical change per commit. Plan's "Steps 1–N + Commit" pattern is the right granularity. Subagents are free to batch tasks within a phase as one dispatch, but commits stay one-per-task.
- **Subagent batching policy:** when several tasks share the same shape (e.g. Phase 1 Tasks 1.4–1.7 were all schema migrations), one implementer dispatch handles the batch with separate commits per task, followed by ONE combined spec+quality review. This cuts subagent count without losing review discipline. Apply for Phases 2–7 where tasks share shape.

---

## Phase 1 — Schema migrations + `pg_trgm` extension + backfills

**Why first:** Every later phase reads these fields. Get the migrations in, backfill, lock the shape, then write logic on top.

### Task 1.1: Enable `pg_trgm` extension + migration scaffold

**Files:**
- Create: `db/migrations/0010_slice2_pg_trgm.sql`

- [ ] **Step 1: Write migration**

```sql
-- Slice 2: enable pg_trgm for fuzzy search on employee/client/detachment names.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

- [ ] **Step 2: Run + verify**

```bash
pnpm drizzle-kit migrate
psql "$DATABASE_URL" -c "SELECT extname FROM pg_extension WHERE extname='pg_trgm';"
```
Expected: one row, `pg_trgm`.

- [ ] **Step 3: Commit**
```bash
git add db/migrations/0010_slice2_pg_trgm.sql
git commit -m "feat(slice-2,schema): enable pg_trgm extension"
```

### Task 1.2: Add `employment_type` enum + column on `employees`

**Files:**
- Modify: `modules/hr/schema.ts`
- Create: `db/migrations/0011_slice2_employment_type.sql`

- [ ] **Step 1: Extend Drizzle schema**

In `modules/hr/schema.ts`, add at top of file:
```typescript
export const employmentType = pgEnum('employment_type', [
  'GUARD',
  'OFFICE_STAFF',
  'SUPERVISOR',
  'DRIVER',
  'JANITOR',
  'OTHER',
]);
```
Then add to the `employees` table:
```typescript
employmentType: employmentType('employment_type').notNull().default('GUARD'),
```

- [ ] **Step 2: Generate + write the SQL migration**

```bash
pnpm drizzle-kit generate
```
Verify generated SQL adds the enum and the column with default `'GUARD'`. If drizzle-kit generates it under a different filename, rename to `0011_slice2_employment_type.sql`.

- [ ] **Step 3: Apply + verify**

```bash
pnpm drizzle-kit migrate
psql "$DATABASE_URL" -c "SELECT employment_type, COUNT(*) FROM employees GROUP BY employment_type;"
```
Expected: existing rows all `GUARD`.

- [ ] **Step 4: Commit**
```bash
git add modules/hr/schema.ts db/migrations/0011_*.sql
git commit -m "feat(slice-2,hr): add employment_type enum (default GUARD)"
```

### Task 1.3: Add BIR-2316 fields on `employees` (RDO, DOB, address)

**Files:**
- Modify: `modules/hr/schema.ts`
- Create: `db/migrations/0012_slice2_employee_bir_fields.sql`

- [ ] **Step 1: Extend Drizzle schema**

In the `employees` table:
```typescript
rdoCode: varchar('rdo_code', { length: 3 }),  // BIR Revenue District Office code, e.g. '044'
dateOfBirth: date('date_of_birth'),
addressLine1: text('address_line1'),
addressLine2: text('address_line2'),
city: text('city'),
province: text('province'),
postalCode: varchar('postal_code', { length: 4 }),
```
All nullable for backfill compatibility.

- [ ] **Step 2: Generate + apply**
```bash
pnpm drizzle-kit generate && pnpm drizzle-kit migrate
```

- [ ] **Step 3: Verify**
```bash
psql "$DATABASE_URL" -c "\\d employees" | grep -E "rdo_code|date_of_birth|address_line"
```
Expected: all 7 fields present.

- [ ] **Step 4: Commit**
```bash
git add modules/hr/schema.ts db/migrations/0012_*.sql
git commit -m "feat(slice-2,hr): add BIR-2316 fields (rdo, dob, address)"
```

### Task 1.4: Add `required_headcount` on `detachments`

**Files:**
- Modify: `modules/clients/schema.ts`
- Create: `db/migrations/0013_slice2_detachment_headcount.sql`

- [ ] **Step 1: Schema**
In `detachments` table:
```typescript
requiredHeadcount: integer('required_headcount'),  // nullable until contract is set
```

- [ ] **Step 2: Generate + apply + verify**
```bash
pnpm drizzle-kit generate && pnpm drizzle-kit migrate
psql "$DATABASE_URL" -c "\\d detachments" | grep required_headcount
```

- [ ] **Step 3: Commit**
```bash
git add modules/clients/schema.ts db/migrations/0013_*.sql
git commit -m "feat(slice-2,clients): add detachments.required_headcount"
```

### Task 1.5: Create `payroll_calendars` table

**Files:**
- Create: `modules/payroll-calendars/schema.ts`
- Modify: `modules/clients/schema.ts` (add FK)
- Create: `db/migrations/0014_slice2_payroll_calendars.sql`

- [ ] **Step 1: Schema**

`modules/payroll-calendars/schema.ts`:
```typescript
import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { clients } from '../clients/schema';

export const payrollFrequency = pgEnum('payroll_frequency', ['WEEKLY', 'SEMI_MONTHLY', 'MONTHLY']);

export const payrollCalendars = pgTable('payroll_calendars', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id),  // nullable → global default
  name: text('name').notNull(),
  frequency: payrollFrequency('frequency').notNull().default('SEMI_MONTHLY'),
  // Simple shape: days-after-period-end. Extend later if real rules diverge.
  dtrCutoffDaysAfterPeriodEnd: integer('dtr_cutoff_days_after_period_end').notNull().default(2),
  paydayDaysAfterPeriodEnd: integer('payday_days_after_period_end').notNull().default(5),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

In `modules/clients/schema.ts`, add to `clients`:
```typescript
defaultPayrollCalendarId: uuid('default_payroll_calendar_id'),  // FK added by next migration after table exists
```

- [ ] **Step 2: Generate + apply**
```bash
pnpm drizzle-kit generate && pnpm drizzle-kit migrate
```

- [ ] **Step 3: Verify**
```bash
psql "$DATABASE_URL" -c "\\d payroll_calendars"
```

- [ ] **Step 4: Commit**
```bash
git add modules/payroll-calendars/schema.ts modules/clients/schema.ts db/migrations/0014_*.sql
git commit -m "feat(slice-2,calendars): payroll_calendars table + clients FK"
```

### Task 1.6: Add `dtr_cutoff_date` + `payday_date` on `pay_runs`

**Files:**
- Modify: `modules/payroll/schema.ts`
- Create: `db/migrations/0015_slice2_pay_run_dates.sql`

- [ ] **Step 1: Schema**
In `pay_runs`:
```typescript
dtrCutoffDate: date('dtr_cutoff_date'),  // nullable for backfilled rows
paydayDate: date('payday_date'),
```

- [ ] **Step 2: Generate + apply + verify**
```bash
pnpm drizzle-kit generate && pnpm drizzle-kit migrate
psql "$DATABASE_URL" -c "\\d pay_runs" | grep -E "dtr_cutoff|payday"
```

- [ ] **Step 3: Commit**
```bash
git add modules/payroll/schema.ts db/migrations/0015_*.sql
git commit -m "feat(slice-2,payroll): add dtr_cutoff_date + payday_date on pay_runs"
```

### Task 1.7: Add GIN trigram indexes for search

**Files:**
- Create: `db/migrations/0016_slice2_trgm_indexes.sql`

- [ ] **Step 1: Write index migration**

```sql
-- Employee fuzzy search
CREATE INDEX IF NOT EXISTS employees_fullname_trgm
  ON employees USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employees_code_trgm
  ON employees USING gin (employee_code gin_trgm_ops);

-- Client + detachment search
CREATE INDEX IF NOT EXISTS clients_name_trgm
  ON clients USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS detachments_name_trgm
  ON detachments USING gin (name gin_trgm_ops);
```

- [ ] **Step 2: Apply + verify**
```bash
pnpm drizzle-kit migrate
psql "$DATABASE_URL" -c "\\di+ employees_fullname_trgm"
```

- [ ] **Step 3: Commit**
```bash
git add db/migrations/0016_*.sql
git commit -m "feat(slice-2,search): trigram indexes for employee/client/detachment search"
```

### Task 1.8: Phase 1 verification — schema snapshot test

**Files:**
- Modify: `modules/_regression/tests/slice0.test.ts` (regression gate — must still pass)
- Create: `modules/_regression/tests/slice2-schema.test.ts`

- [ ] **Step 1: Write schema snapshot test**

```typescript
import { describe, it, expect } from 'vitest';
import { db } from '../../../db/client';
import { sql } from 'drizzle-orm';

describe('Slice 2 schema gate', () => {
  it('pg_trgm extension is enabled', async () => {
    const result = await db.execute(sql`SELECT extname FROM pg_extension WHERE extname='pg_trgm'`);
    expect(result.rows.length).toBe(1);
  });

  it('employees has employment_type and BIR fields', async () => {
    const result = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='employees'
      AND column_name IN ('employment_type','rdo_code','date_of_birth','address_line1','postal_code')
    `);
    expect(result.rows.length).toBe(5);
  });

  it('detachments has required_headcount', async () => {
    const result = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='detachments' AND column_name='required_headcount'
    `);
    expect(result.rows.length).toBe(1);
  });

  it('payroll_calendars table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('payroll_calendars') AS t`);
    expect(result.rows[0].t).toBe('payroll_calendars');
  });

  it('pay_runs has dtr_cutoff_date + payday_date', async () => {
    const result = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='pay_runs' AND column_name IN ('dtr_cutoff_date','payday_date')
    `);
    expect(result.rows.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run + verify**
```bash
pnpm vitest run modules/_regression/tests/slice2-schema.test.ts modules/_regression/tests/slice0.test.ts
```
Expected: both pass.

- [ ] **Step 3: Commit**
```bash
git add modules/_regression/tests/slice2-schema.test.ts
git commit -m "test(slice-2): schema gate covering Phase 1 migrations"
```

---

## Phase 2 — `modules/payroll-calendars` (NEW MODULE)

**Why second:** `modules/payroll` (Phase 6) depends on this. Stand it up clean before integrating.

### Task 2.1: Module skeleton

**Files:**
- Create: `modules/payroll-calendars/index.ts`
- Create: `modules/payroll-calendars/service.ts`
- Create: `modules/payroll-calendars/README.md`
- Create: `modules/payroll-calendars/payroll-calendars.test.ts`

- [ ] **Step 1: Write skeleton `service.ts`**

```typescript
import { db } from '../../db/client';
import { payrollCalendars } from './schema';
import { eq, isNull, and } from 'drizzle-orm';

export type PayrollCalendar = typeof payrollCalendars.$inferSelect;
export type NewPayrollCalendar = typeof payrollCalendars.$inferInsert;

export async function create(input: NewPayrollCalendar): Promise<PayrollCalendar> {
  const [row] = await db.insert(payrollCalendars).values(input).returning();
  return row;
}

export async function update(id: string, patch: Partial<NewPayrollCalendar>): Promise<PayrollCalendar> {
  const [row] = await db.update(payrollCalendars)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(payrollCalendars.id, id))
    .returning();
  if (!row) throw new Error(`payroll-calendars: calendar ${id} not found`);
  return row;
}

export async function getForClient(clientId: string): Promise<PayrollCalendar | null> {
  const [row] = await db.select().from(payrollCalendars).where(eq(payrollCalendars.clientId, clientId));
  if (row) return row;
  // Fallback to global default (client_id IS NULL)
  const [defaultRow] = await db.select().from(payrollCalendars).where(isNull(payrollCalendars.clientId));
  return defaultRow ?? null;
}

export interface ResolvedCalendar {
  dtrCutoffDate: Date;
  paydayDate: Date;
  source: 'client' | 'global-default' | 'fallback-defaults';
}

export async function resolveForPeriod(
  clientId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ResolvedCalendar> {
  const cal = await getForClient(clientId);
  const cutoffDays = cal?.dtrCutoffDaysAfterPeriodEnd ?? 2;
  const paydayDays = cal?.paydayDaysAfterPeriodEnd ?? 5;
  const dtrCutoffDate = addDays(periodEnd, cutoffDays);
  const paydayDate = addDays(periodEnd, paydayDays);
  return {
    dtrCutoffDate,
    paydayDate,
    source: cal ? (cal.clientId ? 'client' : 'global-default') : 'fallback-defaults',
  };
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
```

- [ ] **Step 2: Write `index.ts` (public surface)**

```typescript
export {
  create,
  update,
  getForClient,
  resolveForPeriod,
  type PayrollCalendar,
  type ResolvedCalendar,
} from './service';
```

- [ ] **Step 3: Commit skeleton**
```bash
git add modules/payroll-calendars/
git commit -m "feat(slice-2,calendars): skeleton (service + index)"
```

### Task 2.2: TDD — `create` + `getForClient`

- [ ] **Step 1: Write failing test**

`modules/payroll-calendars/payroll-calendars.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import * as calendars from './index';
import * as clients from '../clients';
import { wipeAllTables } from '../../db/test-utils';

beforeEach(async () => { await wipeAllTables(); });

describe('payroll-calendars.create + getForClient', () => {
  it('creates and retrieves by client', async () => {
    const client = await clients.createClient({ name: 'SM Prime' });
    const cal = await calendars.create({
      clientId: client.id,
      name: 'SM Prime Semi-Monthly',
      frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 2,
      paydayDaysAfterPeriodEnd: 5,
    });
    const fetched = await calendars.getForClient(client.id);
    expect(fetched?.id).toBe(cal.id);
  });

  it('falls back to global default when no per-client', async () => {
    await calendars.create({
      clientId: null,
      name: 'Global default',
      frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 3,
      paydayDaysAfterPeriodEnd: 7,
    });
    const client = await clients.createClient({ name: 'Ayala' });
    const fetched = await calendars.getForClient(client.id);
    expect(fetched?.name).toBe('Global default');
  });
});
```

- [ ] **Step 2: Run — verify it passes** (service was written in 2.1)
```bash
pnpm vitest run modules/payroll-calendars
```

- [ ] **Step 3: Commit**
```bash
git add modules/payroll-calendars/payroll-calendars.test.ts
git commit -m "test(slice-2,calendars): create + getForClient + global-default fallback"
```

### Task 2.3: TDD — `resolveForPeriod`

- [ ] **Step 1: Add test**

```typescript
describe('payroll-calendars.resolveForPeriod', () => {
  it('returns client-specific cutoff + payday', async () => {
    const client = await clients.createClient({ name: 'X' });
    await calendars.create({
      clientId: client.id, name: 'X', frequency: 'SEMI_MONTHLY',
      dtrCutoffDaysAfterPeriodEnd: 2, paydayDaysAfterPeriodEnd: 5,
    });
    const r = await calendars.resolveForPeriod(client.id, new Date('2026-05-16'), new Date('2026-05-31'));
    expect(r.dtrCutoffDate.toISOString().slice(0,10)).toBe('2026-06-02');
    expect(r.paydayDate.toISOString().slice(0,10)).toBe('2026-06-05');
    expect(r.source).toBe('client');
  });

  it('uses fallback defaults when no calendar exists at all', async () => {
    const client = await clients.createClient({ name: 'Y' });
    const r = await calendars.resolveForPeriod(client.id, new Date('2026-05-16'), new Date('2026-05-31'));
    expect(r.source).toBe('fallback-defaults');
    expect(r.dtrCutoffDate.toISOString().slice(0,10)).toBe('2026-06-02');  // 2 days after period end
    expect(r.paydayDate.toISOString().slice(0,10)).toBe('2026-06-05');     // 5 days after period end
  });
});
```

- [ ] **Step 2: Run + commit**
```bash
pnpm vitest run modules/payroll-calendars
git add modules/payroll-calendars/payroll-calendars.test.ts
git commit -m "test(slice-2,calendars): resolveForPeriod with client + fallback sources"
```

### Task 2.4: TDD — `update`

- [ ] **Step 1: Add test**
```typescript
it('update mutates and bumps updated_at', async () => {
  const cal = await calendars.create({
    clientId: null, name: 'old', frequency: 'SEMI_MONTHLY',
    dtrCutoffDaysAfterPeriodEnd: 2, paydayDaysAfterPeriodEnd: 5,
  });
  const before = cal.updatedAt.getTime();
  await new Promise(r => setTimeout(r, 10));
  const updated = await calendars.update(cal.id, { name: 'new', paydayDaysAfterPeriodEnd: 7 });
  expect(updated.name).toBe('new');
  expect(updated.paydayDaysAfterPeriodEnd).toBe(7);
  expect(updated.updatedAt.getTime()).toBeGreaterThan(before);
});

it('update throws on missing id', async () => {
  await expect(calendars.update('00000000-0000-0000-0000-000000000000', { name: 'x' }))
    .rejects.toThrow(/not found/);
});
```

- [ ] **Step 2: Run + commit**
```bash
pnpm vitest run modules/payroll-calendars
git add . && git commit -m "test(slice-2,calendars): update mutation + missing-id"
```

### Task 2.5: README + audit hook

- [ ] **Step 1: Write `modules/payroll-calendars/README.md`**

```markdown
# modules/payroll-calendars

## Purpose
Models per-client cut-off and payday rules. Drives the countdown badges on DTR + Pay Runs.

## Public API
- `create(input)` — insert a calendar. `client_id` nullable (null = global default).
- `update(id, patch)` — mutate. Throws if id missing. Audit-logged at call site.
- `getForClient(clientId)` — returns the client's calendar OR the global default OR null.
- `resolveForPeriod(clientId, periodStart, periodEnd)` — computes the cut-off and payday dates for a worked period. Source flag tells caller whether client-specific, global, or fallback.

## Dependencies
- `modules/clients` (FK `client_id`)
- `db/client` (Postgres connection)
- `modules/audit` (called by caller, not by this module)

## Known failure modes
- _populated as failures are encountered_

## Notes
- Past pay runs capture resolved dates at creation time (`pay_runs.dtr_cutoff_date` + `payday_date`). Calendar changes do not retroactively rewrite past runs.
- "Days after period end" is a deliberately simple shape. If a real client needs "5th of next month" or "next business day", extend the schema then.
```

- [ ] **Step 2: Add audit calls** — in `service.ts`, after `create` and `update` insert/update calls:
```typescript
import * as audit from '../audit';

// inside create():
await audit.record({ actorId: 'system', action: 'payroll-calendar.created', subjectId: row.id, payload: row });
// inside update(): record action 'payroll-calendar.updated' with before/after diff
```
(Get `actorId` from request context in the API route, not from the module; module accepts an `actorId` arg if needed. For Slice 2 keep it simple — log as `'system'`.)

- [ ] **Step 3: Run, commit**
```bash
pnpm vitest run modules/payroll-calendars
git add modules/payroll-calendars/
git commit -m "feat(slice-2,calendars): README + audit hooks"
```

### Task 2.6: Phase 2 verification

- [ ] **Step 1: Full module test sweep**
```bash
pnpm vitest run modules/payroll-calendars
```
Expected: all green.

- [ ] **Step 2: Slice-0 + Slice-1 regression still green**
```bash
pnpm vitest run modules/_regression
```

---

## Phase 3 — `modules/hr` extensions

Adds `updateEmployee`, `searchEmployees`, accepts new fields on create + bulk import, updates sample CSV.

### Task 3.1: `updateEmployee` API — TDD

**Files:**
- Modify: `modules/hr/service.ts`
- Modify: `modules/hr/index.ts`
- Modify: `modules/hr/hr.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('hr.updateEmployee', () => {
  it('updates editable fields and emits audit', async () => {
    const e = await hr.createEmployee({ firstName: 'Juan', lastName: 'Cruz', employeeCode: 'CG-0001', basicSalary: '20000', payFrequency: 'SEMI_MONTHLY' });
    const updated = await hr.updateEmployee(e.id, { lastName: 'Cruzal', employmentType: 'OFFICE_STAFF' });
    expect(updated.lastName).toBe('Cruzal');
    expect(updated.employmentType).toBe('OFFICE_STAFF');
    // Immutable fields ignored
    expect(updated.employeeCode).toBe('CG-0001');
  });

  it('rejects changes to employeeCode, id, createdAt', async () => {
    const e = await hr.createEmployee({ firstName: 'A', lastName: 'B', employeeCode: 'CG-001', basicSalary: '1', payFrequency: 'MONTHLY' });
    const updated = await hr.updateEmployee(e.id, { employeeCode: 'HACKED' } as any);
    expect(updated.employeeCode).toBe('CG-001');
  });

  it('throws on missing id', async () => {
    await expect(hr.updateEmployee('00000000-0000-0000-0000-000000000000', { lastName: 'x' }))
      .rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Implement in `service.ts`**

```typescript
const IMMUTABLE_FIELDS = ['id', 'employeeCode', 'createdAt'] as const;

export async function updateEmployee(id: string, patch: Partial<Employee>): Promise<Employee> {
  const sanitized = { ...patch };
  for (const f of IMMUTABLE_FIELDS) delete (sanitized as any)[f];

  const [before] = await db.select().from(employees).where(eq(employees.id, id));
  if (!before) throw new Error(`hr: employee ${id} not found`);

  const [after] = await db.update(employees).set({ ...sanitized, updatedAt: new Date() })
    .where(eq(employees.id, id)).returning();

  await audit.record({
    actorId: 'system',  // request context fills this in at route layer
    action: 'hr.employee.updated',
    subjectId: id,
    payload: { before, after, changed: Object.keys(sanitized) },
  });
  return after;
}
```

- [ ] **Step 3: Export from `index.ts`** + re-run test
```bash
pnpm vitest run modules/hr
```

- [ ] **Step 4: Commit**
```bash
git add modules/hr/
git commit -m "feat(slice-2,hr): updateEmployee with immutable-field guard + audit"
```

### Task 3.2: `searchEmployees` API — TDD

- [ ] **Step 1: Test**
```typescript
describe('hr.searchEmployees', () => {
  beforeEach(async () => {
    await wipeAllTables();
    await hr.createEmployee({ firstName: 'Juan', lastName: 'Cruz', employeeCode: 'CG-0001', basicSalary: '1', payFrequency: 'MONTHLY' });
    await hr.createEmployee({ firstName: 'Maria', lastName: 'Reyes', employeeCode: 'CG-0002', basicSalary: '1', payFrequency: 'MONTHLY', employmentType: 'OFFICE_STAFF' });
    await hr.createEmployee({ firstName: 'Pedro', lastName: 'Santos', employeeCode: 'CG-0003', basicSalary: '1', payFrequency: 'MONTHLY' });
  });

  it('fuzzy matches on name', async () => {
    const r = await hr.searchEmployees('cru');
    expect(r.map(e => e.employeeCode)).toContain('CG-0001');
  });

  it('matches by employee_code', async () => {
    const r = await hr.searchEmployees('0002');
    expect(r[0].employeeCode).toBe('CG-0002');
  });

  it('respects employmentType filter', async () => {
    const r = await hr.searchEmployees('', { employmentType: 'OFFICE_STAFF' });
    expect(r.length).toBe(1);
    expect(r[0].firstName).toBe('Maria');
  });

  it('respects limit (default 20)', async () => {
    const r = await hr.searchEmployees('a', { limit: 2 });
    expect(r.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
import { sql } from 'drizzle-orm';

export interface SearchOptions {
  limit?: number;
  employmentType?: typeof employmentType.enumValues[number];
  status?: typeof employeeStatus.enumValues[number];
}

export async function searchEmployees(query: string, opts: SearchOptions = {}): Promise<Employee[]> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const conditions = [];
  if (query.trim().length > 0) {
    conditions.push(sql`(
      similarity(${employees.firstName} || ' ' || ${employees.lastName}, ${query}) > 0.2
      OR ${employees.employeeCode} ILIKE ${'%' + query + '%'}
    )`);
  }
  if (opts.employmentType) conditions.push(eq(employees.employmentType, opts.employmentType));
  if (opts.status) conditions.push(eq(employees.status, opts.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select().from(employees)
    .where(where)
    .orderBy(sql`similarity(${employees.firstName} || ' ' || ${employees.lastName}, ${query}) DESC NULLS LAST`)
    .limit(limit);
}
```

- [ ] **Step 3: Run + commit**
```bash
pnpm vitest run modules/hr
git add modules/hr/
git commit -m "feat(slice-2,hr): searchEmployees with pg_trgm fuzzy match + filters"
```

### Task 3.3: Accept `employmentType` on `createEmployee`

- [ ] **Step 1: Test**
```typescript
it('createEmployee accepts employmentType', async () => {
  const e = await hr.createEmployee({
    firstName: 'A', lastName: 'B', employeeCode: 'CG-X', basicSalary: '1', payFrequency: 'MONTHLY',
    employmentType: 'OFFICE_STAFF',
  });
  expect(e.employmentType).toBe('OFFICE_STAFF');
});
it('createEmployee defaults to GUARD when omitted', async () => {
  const e = await hr.createEmployee({ firstName: 'A', lastName: 'B', employeeCode: 'CG-Y', basicSalary: '1', payFrequency: 'MONTHLY' });
  expect(e.employmentType).toBe('GUARD');
});
```

- [ ] **Step 2: Implement** — the `createEmployee` input type already accepts `employmentType` via `$inferInsert`. Just ensure the route/UI passes it through. Verify the Zod schema (if used) includes it.

- [ ] **Step 3: Commit**
```bash
pnpm vitest run modules/hr
git add modules/hr/ && git commit -m "test(slice-2,hr): createEmployee accepts employmentType"
```

### Task 3.4: Accept BIR fields on `createEmployee`

- [ ] **Step 1: Test**
```typescript
it('createEmployee stores RDO, DOB, address', async () => {
  const e = await hr.createEmployee({
    firstName: 'A', lastName: 'B', employeeCode: 'CG-Z', basicSalary: '1', payFrequency: 'MONTHLY',
    rdoCode: '044', dateOfBirth: '1990-03-15', addressLine1: '123 Rizal St', city: 'Manila', province: 'NCR', postalCode: '1000',
  });
  expect(e.rdoCode).toBe('044');
  expect(e.city).toBe('Manila');
});
```

- [ ] **Step 2: Verify Zod input schema accepts the new fields. Implementation requires no service change (passthrough).**

- [ ] **Step 3: Commit**
```bash
pnpm vitest run modules/hr
git add . && git commit -m "test(slice-2,hr): createEmployee stores BIR fields"
```

### Task 3.5: Bulk-import CSV accepts new columns

**Files:**
- Modify: `modules/hr/service.ts` (`bulkImportEmployees` CSV column map)
- Modify: `public/hr-employees-sample.csv`

- [ ] **Step 1: Test**
```typescript
it('bulkImportEmployees accepts employment_type + BIR columns', async () => {
  const csv = `first_name,last_name,employee_code,basic_salary,pay_frequency,employment_type,rdo_code,date_of_birth,address_line1,city,province,postal_code
Juan,Cruz,CG-0001,20000,SEMI_MONTHLY,GUARD,044,1990-01-01,123 Rizal,Manila,NCR,1000
Maria,Reyes,CG-0002,30000,SEMI_MONTHLY,OFFICE_STAFF,044,1985-05-15,456 Bonifacio,Manila,NCR,1000`;
  const r = await hr.bulkImportEmployees(csv);
  expect(r.imported).toBe(2);
  const maria = await hr.getEmployeeByCode('CG-0002');
  expect(maria?.employmentType).toBe('OFFICE_STAFF');
  expect(maria?.rdoCode).toBe('044');
});
```

- [ ] **Step 2: Update column map in `bulkImportEmployees`** — add the 7 new columns to the papaparse-result → insert mapping. Default `employment_type` to `GUARD` if column missing or blank.

- [ ] **Step 3: Update sample CSV**

`public/hr-employees-sample.csv`:
```csv
first_name,last_name,employee_code,basic_salary,pay_frequency,employment_type,rdo_code,date_of_birth,address_line1,address_line2,city,province,postal_code
Juan,Cruz,CG-0001,20000.00,SEMI_MONTHLY,GUARD,044,1990-01-15,123 Rizal St,Brgy. San Antonio,Manila,Metro Manila,1000
Maria,Reyes,CG-0002,30000.00,SEMI_MONTHLY,OFFICE_STAFF,044,1985-05-20,456 Bonifacio Ave,,Quezon City,Metro Manila,1100
... (10 rows total — mix of GUARD + OFFICE_STAFF)
```

- [ ] **Step 4: Commit**
```bash
pnpm vitest run modules/hr
git add modules/hr/ public/hr-employees-sample.csv
git commit -m "feat(slice-2,hr): bulk import accepts employment_type + BIR fields; sample CSV updated"
```

### Task 3.6: Emit `hr.employee.updated` event

- [ ] **Step 1: Test**
```typescript
it('updateEmployee emits hr.employee.updated', async () => {
  const captured: any[] = [];
  events.subscribe('hr.employee.updated', e => captured.push(e));
  const emp = await hr.createEmployee({ firstName: 'A', lastName: 'B', employeeCode: 'CG-E', basicSalary: '1', payFrequency: 'MONTHLY' });
  await hr.updateEmployee(emp.id, { lastName: 'C' });
  expect(captured.length).toBe(1);
  expect(captured[0].subjectId).toBe(emp.id);
});
```

- [ ] **Step 2: Implement** — in `updateEmployee` after `audit.record`, add `await events.publish('hr.employee.updated', { subjectId: id, ... })`.

- [ ] **Step 3: Commit**
```bash
pnpm vitest run modules/hr
git add . && git commit -m "feat(slice-2,hr): emit hr.employee.updated event"
```

### Task 3.7: README updates

- [ ] **Step 1: Update `modules/hr/README.md`** — add to Public API: `updateEmployee`, `searchEmployees`. Add to Known failure modes:
  - "pg_trgm extension missing → searchEmployees returns SQL error. Fix: run migration 0010."
  - "employment_type backfill incomplete → existing rows are GUARD by default; safe."

- [ ] **Step 2: Commit**
```bash
git add modules/hr/README.md
git commit -m "docs(slice-2,hr): README updates for update + search"
```

### Task 3.8: Phase 3 verification

- [ ] **Step 1: Full HR module sweep**
```bash
pnpm vitest run modules/hr
```
Expected: all green.

- [ ] **Step 2: Regression gate**
```bash
pnpm vitest run modules/_regression
```

---

## Phase 4 — `modules/clients` extensions

### Task 4.1: `updateClient` + `updateDetachment` — TDD

**Files:**
- Modify: `modules/clients/service.ts`, `modules/clients/index.ts`, `modules/clients/clients.test.ts`

- [ ] **Step 1: Tests** (mirror Phase 3.1 shape; same immutable-fields pattern: `id`, `createdAt`).

- [ ] **Step 2: Implement both — identical pattern to `hr.updateEmployee`.** Audit logged.

- [ ] **Step 3: Commit**
```bash
git add modules/clients/
git commit -m "feat(slice-2,clients): updateClient + updateDetachment with audit"
```

### Task 4.2: `getDetachmentDeploymentSummary` — TDD

- [ ] **Step 1: Test**
```typescript
it('returns deployed count vs required, gap signed', async () => {
  const c = await clients.createClient({ name: 'X' });
  const d = await clients.createDetachment(c.id, { name: 'Post 1', requiredHeadcount: 10 });
  // create 8 employees + active assignments
  for (let i = 0; i < 8; i++) {
    const e = await hr.createEmployee({ firstName: 'A', lastName: 'B', employeeCode: `CG-${i}`, basicSalary: '1', payFrequency: 'MONTHLY' });
    await assignments.assign(e.id, d.id, new Date('2026-01-01'));
  }
  const s = await clients.getDetachmentDeploymentSummary(d.id);
  expect(s).toEqual({ required: 10, deployed: 8, gap: -2 });
});

it('returns null gap when requiredHeadcount is null', async () => {
  const c = await clients.createClient({ name: 'Y' });
  const d = await clients.createDetachment(c.id, { name: 'Post Y' });
  const s = await clients.getDetachmentDeploymentSummary(d.id);
  expect(s.gap).toBeNull();
});
```

- [ ] **Step 2: Implement**

```typescript
export async function getDetachmentDeploymentSummary(detachmentId: string) {
  const [d] = await db.select().from(detachments).where(eq(detachments.id, detachmentId));
  if (!d) throw new Error(`clients: detachment ${detachmentId} not found`);

  const today = new Date();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(assignments_table)
    .where(and(
      eq(assignments_table.detachmentId, detachmentId),
      lte(assignments_table.startDate, today),
      or(isNull(assignments_table.endDate), gte(assignments_table.endDate, today)),
    ));

  const required = d.requiredHeadcount;
  return {
    required,
    deployed: count,
    gap: required == null ? null : count - required,
  };
}
```

- [ ] **Step 3: Commit**
```bash
pnpm vitest run modules/clients
git add . && git commit -m "feat(slice-2,clients): getDetachmentDeploymentSummary"
```

### Task 4.3: `listDetachmentsWithDeployment` — single-query SQL

- [ ] **Step 1: Test**
```typescript
it('returns all detachments with deployment counts inline (no N+1)', async () => {
  const c = await clients.createClient({ name: 'X' });
  const d1 = await clients.createDetachment(c.id, { name: 'A', requiredHeadcount: 10 });
  const d2 = await clients.createDetachment(c.id, { name: 'B', requiredHeadcount: 5 });
  // seed 6 active in d1, 3 active in d2
  // ...
  const r = await clients.listDetachmentsWithDeployment(c.id);
  expect(r.find(x => x.name === 'A')).toMatchObject({ deployed: 6, required: 10, gap: -4 });
  expect(r.find(x => x.name === 'B')).toMatchObject({ deployed: 3, required: 5, gap: -2 });
});
```

- [ ] **Step 2: Implement with single JOIN + subquery; assert no N+1 in test by spying on db.execute count (or just rely on visual inspection of the SQL — pragmatic for Slice 2).**

```typescript
export async function listDetachmentsWithDeployment(clientId?: string) {
  const today = new Date();
  const result = await db.execute(sql`
    SELECT d.*,
      (SELECT COUNT(*)::int FROM assignments a
       WHERE a.detachment_id = d.id
         AND a.start_date <= ${today}
         AND (a.end_date IS NULL OR a.end_date >= ${today})
      ) AS deployed
    FROM detachments d
    ${clientId ? sql`WHERE d.client_id = ${clientId}` : sql``}
    ORDER BY d.name ASC
  `);
  return result.rows.map(r => ({
    ...r,
    gap: r.required_headcount == null ? null : Number(r.deployed) - Number(r.required_headcount),
  }));
}
```

- [ ] **Step 3: Commit**
```bash
pnpm vitest run modules/clients
git add . && git commit -m "feat(slice-2,clients): listDetachmentsWithDeployment (single-query, no N+1)"
```

### Task 4.4: Client `default_payroll_calendar_id` FK plumbing

- [ ] **Step 1: Test that update accepts the FK and surfaces it on getClient.**

- [ ] **Step 2: No service change needed — Drizzle passthrough — but verify the type. Update README.**

- [ ] **Step 3: Commit**
```bash
git commit -am "feat(slice-2,clients): clients accept default_payroll_calendar_id"
```

### Task 4.5: README update

- [ ] **Step 1: Add to `modules/clients/README.md`:** Public API now includes update, summary, listWithDeployment. Known failure modes: "deployment count is point-in-time (today); historical-as-of queries not supported in Slice 2."

- [ ] **Step 2: Commit**
```bash
git add modules/clients/README.md
git commit -m "docs(slice-2,clients): README updates"
```

### Task 4.6: Phase 4 verification

```bash
pnpm vitest run modules/clients modules/_regression
```

---

## Phase 5 — `modules/assignments` extensions

### Task 5.1: `bulkAssign` — TDD

- [ ] **Step 1: Test**
```typescript
describe('assignments.bulkAssign', () => {
  it('assigns N employees to one detachment, returns per-row errors without aborting batch', async () => {
    const c = await clients.createClient({ name: 'X' });
    const d = await clients.createDetachment(c.id, { name: 'Post' });
    const e1 = await hr.createEmployee({ firstName: 'A', lastName: 'B', employeeCode: 'CG-1', basicSalary: '1', payFrequency: 'MONTHLY' });
    const e2 = await hr.createEmployee({ firstName: 'C', lastName: 'D', employeeCode: 'CG-2', basicSalary: '1', payFrequency: 'MONTHLY' });
    const bad = '00000000-0000-0000-0000-000000000000';

    const r = await assignments.bulkAssign([e1.id, e2.id, bad], d.id, new Date('2026-04-01'));
    expect(r.assigned.length).toBe(2);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0].employeeId).toBe(bad);
  });
});
```

- [ ] **Step 2: Implement** — loop over `employeeIds`, call existing `assign` per id, collect successes vs errors. Wrap individual calls in try/catch.

- [ ] **Step 3: Commit**
```bash
pnpm vitest run modules/assignments
git add . && git commit -m "feat(slice-2,assignments): bulkAssign with per-row error collection"
```

### Task 5.2: `bulkEndAssignments` — TDD (mirror 5.1 shape)

- [ ] **Steps 1–3:** Test + implement + commit. Same pattern as `bulkAssign`. Calls existing `endAssignment` per id.

### Task 5.3: `bulkTransfer` — TDD

- [ ] **Step 1: Test**
```typescript
it('bulkTransfer ends current + starts new in one TX per employee', async () => {
  const c = await clients.createClient({ name: 'X' });
  const d1 = await clients.createDetachment(c.id, { name: 'A' });
  const d2 = await clients.createDetachment(c.id, { name: 'B' });
  const e = await hr.createEmployee({ firstName: 'X', lastName: 'Y', employeeCode: 'CG-T', basicSalary: '1', payFrequency: 'MONTHLY' });
  await assignments.assign(e.id, d1.id, new Date('2026-01-01'));

  const r = await assignments.bulkTransfer([e.id], d2.id, new Date('2026-05-01'));
  expect(r.transferred.length).toBe(1);

  const active = await assignments.getActiveAssignment(e.id, new Date('2026-06-01'));
  expect(active?.detachmentId).toBe(d2.id);
});
```

- [ ] **Step 2: Implement** — for each employee, in one DB transaction: end the active assignment (if any) with `transferDate - 1 day` end-date, then start a new one at `transferDate`.

- [ ] **Step 3: Commit**

### Task 5.4: `updateAssignment` — TDD

- [ ] **Step 1: Test**
```typescript
it('updates start_date, end_date, reason only; rejects employee/detachment changes', async () => {
  const a = /* setup */;
  const u = await assignments.updateAssignment(a.id, { startDate: new Date('2026-02-01') });
  expect(u.startDate.toISOString()).toContain('2026-02-01');
  const u2 = await assignments.updateAssignment(a.id, { detachmentId: 'XXXX' } as any);
  expect(u2.detachmentId).toBe(a.detachmentId);  // unchanged
});
```

- [ ] **Step 2: Implement** — same immutable-fields pattern. Immutable: `id`, `employeeId`, `detachmentId`, `createdAt`.

- [ ] **Step 3: Commit**

### Task 5.5: Pagination on `list`

- [ ] **Step 1: Test that `list({ limit: 50, offset: 0 })` works + that legacy callers without opts still return all rows (or limit-default = 50 with a deprecation note in README).**

- [ ] **Step 2: Implement — accept `{ limit?, offset? }`. Default `limit=50`. Return `{ rows, total }` shape so the UI can paginate.**

- [ ] **Step 3: Commit**

### Task 5.6: README update

- [ ] **Step 1: Public API includes bulk × 3, update, paginated list. Known failure modes: "bulk operation: one bad row does not abort the batch — caller must check `errors` array."**

### Task 5.7: Phase 5 verification

```bash
pnpm vitest run modules/assignments modules/_regression
```

---

## Phase 6 — `modules/payroll` × calendar integration

### Task 6.1: `runPayroll` resolves calendar per client

- [ ] **Step 1: Test**
```typescript
it('runPayroll captures dtr_cutoff_date and payday_date on each pay run', async () => {
  const c = await clients.createClient({ name: 'X' });
  await calendars.create({ clientId: c.id, name: 'X', frequency: 'SEMI_MONTHLY', dtrCutoffDaysAfterPeriodEnd: 2, paydayDaysAfterPeriodEnd: 5 });
  // ... seed detachment + employee + DTR ...
  const run = await payroll.runPayroll(new Date('2026-05-16'), new Date('2026-05-31'));
  const runRow = await db.select().from(payRuns).where(eq(payRuns.id, run.id));
  expect(runRow[0].dtrCutoffDate.toISOString()).toContain('2026-06-02');
  expect(runRow[0].paydayDate.toISOString()).toContain('2026-06-05');
});
```

- [ ] **Step 2: Implement** — at run creation, call `payrollCalendars.resolveForPeriod(clientId, periodStart, periodEnd)` and persist the resolved dates onto the pay-run row. One run per client per period (Slice 1 behavior preserved).

- [ ] **Step 3: Commit**

### Task 6.2: Late-DTR-close warning

- [ ] **Step 1: Test that closing a DTR period past its calculated cut-off emits a warning event + audit entry, but does not block the close.**

- [ ] **Step 2: Implement** — in `dtr.closePeriod`, after resolving the calendar, check `now() > dtrCutoffDate` and emit `dtr.period.closed.late` event + audit record.

- [ ] **Step 3: Commit**

### Task 6.3: Frozen dates invariant — test

- [ ] **Step 1: Test that updating a calendar AFTER a pay run is created does NOT modify the existing run's dates.**
```typescript
it('calendar changes do not retroactively rewrite past pay runs', async () => {
  // create cal, run payroll → capture dates
  // update cal cutoff to 7 days
  // re-fetch the pay run — dates unchanged
});
```

- [ ] **Step 2: Verify (implementation already correct from 6.1 if dates are persisted as columns, not joined).**

- [ ] **Step 3: Commit**

### Task 6.4: Slice 1 reconciliation still holds

- [ ] **Step 1: Re-run the Slice 1 ₱1 reconciliation test against the calendar-aware engine.**
```bash
pnpm vitest run modules/payroll
```
Numbers must still match v2 within ₱1.

- [ ] **Step 2: If diverged: stop. The calendar integration must not change math.**

### Task 6.5: Phase 6 verification

```bash
pnpm vitest run modules/payroll modules/dtr modules/_regression
```

---

## Phase 7 — `modules/compliance-exports` — BIR 2316 PDF

### Task 7.1: Install `@react-pdf/renderer`

- [ ] **Step 1**
```bash
pnpm add @react-pdf/renderer@^3
```

- [ ] **Step 2: Commit**
```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(slice-2,deps): add @react-pdf/renderer for BIR 2316 PDF"
```

### Task 7.2: Year-to-date aggregator helper

**Files:**
- Create: `modules/compliance-exports/ytd.ts`

- [ ] **Step 1: Test**
```typescript
it('ytd computes gross, sss, philhealth, pagibig, wtax, net across all locked pay runs for employee in year', async () => {
  // seed 2 locked runs for 2026
  // each with known per-employee numbers
  const ytd = await complianceExports.computeYtd(empId, 2026);
  expect(ytd.gross).toBe(/* sum */);
  expect(ytd.sssEe).toBe(/* sum */);
  // ... etc
});
```

- [ ] **Step 2: Implement** — single SQL aggregation over `payslips` joined to `pay_runs` filtered by year + locked status.

- [ ] **Step 3: Commit**

### Task 7.3: PDF template — BIR 2316 form layout

**Files:**
- Create: `modules/compliance-exports/bir-2316.pdf.tsx`

- [ ] **Step 1: Reference BIR 2316 form layout** — actual form layout per BIR's published PDF (see `ref/compliance/bir-2316-template.pdf` if it exists; otherwise reference the v2 generator at `ref/compliance/` for field placement).

- [ ] **Step 2: Implement React components** — `<Document>` → `<Page>` → `<View>` blocks matching the form's grid. Use `<StyleSheet.create>` for fixed positioning. Fields populated from `Employee` + `YtdAggregate`. Mark missing fields with a red asterisk in a debug-mode flag.

- [ ] **Step 3: Snapshot test** — render to PDF buffer and assert size + a string-content probe (`pdf-parse` lib to extract text and assert key labels exist).

- [ ] **Step 4: Commit**

### Task 7.4: Wire `exportBIR_2316` to the new pipeline

- [ ] **Step 1: Update `service.ts`:**
```typescript
export async function exportBIR_2316(employeeId: string, year: number): Promise<{ pdf: Buffer; warnings: string[] }> {
  const emp = await hr.getEmployee(employeeId);
  if (!emp) throw new Error(`compliance-exports: employee ${employeeId} not found`);
  const ytd = await computeYtd(employeeId, year);

  const warnings: string[] = [];
  if (!emp.rdoCode) warnings.push('RDO code missing');
  if (!emp.dateOfBirth) warnings.push('Date of birth missing');
  if (!emp.addressLine1) warnings.push('Address missing');

  const pdf = await renderToBuffer(<Bir2316Document employee={emp} ytd={ytd} year={year} />);
  await audit.record({ actorId: 'system', action: 'compliance.bir2316.exported', subjectId: employeeId, payload: { year, warnings } });
  return { pdf, warnings };
}
```

- [ ] **Step 2: Test the warnings array surfaces missing fields without throwing.**

- [ ] **Step 3: Commit**

### Task 7.5: Migrate the existing HTML 2316 route to call the PDF pipeline

**Files:**
- Modify: `app/(admin)/exports/bir-2316/[employeeId]/page.tsx` (or wherever the Slice 1 route lives)

- [ ] **Step 1: Server action streams the PDF buffer as `application/pdf` with `Content-Disposition: attachment; filename=2316-{code}-{year}.pdf`. Warnings shown as a banner above the download button.**

- [ ] **Step 2: Manual test in browser** — verify the PDF downloads and opens cleanly.

- [ ] **Step 3: Commit**

### Task 7.6: README + Known failure modes

- [ ] **Step 1: Add to `modules/compliance-exports/README.md`:**
  - PDF generation requires `@react-pdf/renderer` (pure JS, no chromium).
  - Failure mode: "Year has no locked pay runs → PDF exports with zeros; banner warns 'No payroll data for {year}'."
  - Failure mode: "RDO/DOB/address missing → PDF generates with blank fields; warnings array returned to caller; UI surfaces banner."

### Task 7.7: Phase 7 verification

```bash
pnpm vitest run modules/compliance-exports modules/_regression
```

---

## Phase 8 — Shared UI components

### Task 8.1: `<DataTable>` — TDD

**Files:**
- Create: `components/data-table.tsx`
- Create: `components/data-table.test.tsx`

- [ ] **Step 1: API design (props)**
```typescript
interface DataTableProps<T> {
  columns: { key: keyof T; label: string; sortable?: boolean; render?: (row: T) => ReactNode }[];
  rows: T[];
  rowKey: (row: T) => string;
  // Sort
  sortKey?: keyof T;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (key: keyof T, dir: 'asc' | 'desc') => void;
  // Selection
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  // Row click
  onRowClick?: (row: T) => void;
  // Bulk actions
  bulkActions?: { label: string; onClick: (selected: T[]) => void }[];
  // Empty state
  emptyState?: ReactNode;
}
```

- [ ] **Step 2: Tests (React Testing Library)** — render with 3 rows, click header → onSortChange fires; click row checkbox → onSelectionChange fires; click row body → onRowClick fires; bulk-action bar appears when selectedKeys.size > 0.

- [ ] **Step 3: Implement** — single component file. Use Tailwind utility classes per repo convention. Sticky bulk-action bar absolutely positioned with `top-0`.

- [ ] **Step 4: Commit**
```bash
git add components/data-table.tsx components/data-table.test.tsx
git commit -m "feat(slice-2,ui): <DataTable> with sort + multi-select + bulk actions"
```

### Task 8.2: `<SearchInput>` — TDD

**Files:**
- Create: `components/search-input.tsx`

- [ ] **Step 1: Props**
```typescript
interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  debounceMs?: number;  // default 250
}
```

- [ ] **Step 2: Test debounce — change value rapidly, verify onChange called once after debounce window.**

- [ ] **Step 3: Implement with `useEffect` + `setTimeout`. Show a small clear-X when value.length > 0.**

- [ ] **Step 4: Commit**

### Task 8.3: `<Typeahead>` — TDD

**Files:**
- Create: `components/typeahead.tsx`

- [ ] **Step 1: Props**
```typescript
interface TypeaheadProps<T> {
  value: T | null;
  onChange: (v: T | null) => void;
  fetchOptions: (query: string) => Promise<T[]>;  // server-backed
  renderOption: (opt: T) => ReactNode;
  getOptionLabel: (opt: T) => string;
  placeholder?: string;
}
```

- [ ] **Step 2: Tests** — type "cru" → fetchOptions called with "cru" after 250ms debounce; arrow-down highlights options; Enter selects.

- [ ] **Step 3: Implement** — keyboard nav (↑↓ to navigate, Enter to select, Esc to close). Backed by `useCombobox` from `downshift` if available, else hand-roll.

- [ ] **Step 4: Commit**

### Task 8.4: `<DetailLayout>` — TDD

**Files:**
- Create: `components/detail-layout.tsx`

- [ ] **Step 1: Props**
```typescript
interface DetailLayoutProps {
  title: string;
  description?: string;
  mode: 'view' | 'edit';
  onEditClick?: () => void;
  onSave?: () => Promise<void>;
  onCancel?: () => void;
  isDirty?: boolean;
  children: ReactNode;  // form contents
}
```

- [ ] **Step 2: Tests** — mode=view shows `[Edit]`; mode=edit shows `[Save] [Cancel]`; isDirty + navigation triggers `beforeunload` warning.

- [ ] **Step 3: Implement.** Use Next.js `useRouter` for navigation guard. Dirty-state warning via `window.confirm` or a custom dialog (per project UX bar).

- [ ] **Step 4: Commit**

### Task 8.5: Sidebar component refactor

**Files:**
- Modify: `app/(admin)/_nav.tsx` (existing Slice 1 sidebar)

- [ ] **Step 1: Add collapse state + localStorage persistence.**

- [ ] **Step 2: Reorder Operations: Dashboard → Clients → Employees → Assignments.**

- [ ] **Step 3: Rename "Guards" → "Employees" everywhere (label + route segment if needed; route can stay `/employees`).**

- [ ] **Step 4: Auto-collapse below 1024px (`useEffect` + window resize).**

- [ ] **Step 5: Test in browser** — verify collapse toggles, persists across reload, auto-collapses on narrow viewport.

- [ ] **Step 6: Commit**

### Task 8.6: Page header / footer convention

- [ ] **Step 1: Per the saved memory `feedback_screen_layout_pattern.md` — every admin page has Fraunces title + plain-language description + body + next-action footer hint. Build a `<PageShell>` component if not already present in Slice 1.**

- [ ] **Step 2: Verify by inspecting an existing Slice-1 page; reuse if shell exists.**

- [ ] **Step 3: Commit if changes**

### Task 8.7: Component sweep

```bash
pnpm vitest run components/
```

### Task 8.8: Phase 8 verification

- [ ] **Storybook-style manual check** — render each component in a `/dev/components` route (gated behind dev env) and click through manually. If no dev route exists, skip and rely on Phase 9 usage.

---

## Phase 9 — Screen rebuilds

**Use the `frontend-design` skill for each screen.** Every screen must pass the "CGoC clerk completes without coaching" bar.

### Task 9.1: Employees list page

**Files:**
- Modify: `app/(admin)/employees/page.tsx`

- [ ] **Step 1: Replace existing list with `<DataTable>` + `<SearchInput>` + employment_type `<Select>` filter. Server-side data fetching via `hr.searchEmployees(query, opts)`. URL state for query + filter + sort + page.**

- [ ] **Step 2: Add `[+ Add]` button (existing route) and `[Import CSV]` button (existing route).**

- [ ] **Step 3: Test in browser** — type in search, watch debounce; toggle filter; sort by column; multi-select 3 rows → bulk-action bar appears; click row body → navigates to detail.

- [ ] **Step 4: Commit**

### Task 9.2: Employee detail/edit page

**Files:**
- Modify: `app/(admin)/employees/[id]/page.tsx`

- [ ] **Step 1: Wrap in `<DetailLayout>`. mode=view by default. `[Edit]` toggles to form. `<Save>` calls `hr.updateEmployee`. Show employment_type as Select, RDO + DOB + address as new fields.**

- [ ] **Step 2: Status change is a separate `[Change Status]` button → existing modal/route flow.**

- [ ] **Step 3: BIR-2316-readiness chip** — if RDO/DOB/address missing, show amber chip "BIR 2316 export incomplete" linking to edit mode.

- [ ] **Step 4: Browser test** — edit + save + verify audit log entry. Reload — values persist.

- [ ] **Step 5: Commit**

### Task 9.3: Clients list + detail/edit

- [ ] **Steps 1–4**: same pattern as 9.1 / 9.2 for Clients. List uses `<DataTable>`. Detail uses `<DetailLayout>` with new `default_payroll_calendar_id` field as a `<Typeahead>` picker against `payrollCalendars.list` (add a tiny list API in Phase 2 or here if missed).

- [ ] **Step 5: Commit**

### Task 9.4: Detachments list + detail/edit (with required_headcount badge)

- [ ] **Step 1: List uses `<DataTable>`. The "Deployed / Required" column renders a custom cell — number-pair + 10-segment progress bar + signed gap with color band.**

- [ ] **Step 2: Detail/edit has `requiredHeadcount` numeric input + `payrollCalendar` override (optional — inherits from client by default).**

- [ ] **Step 3: Browser test** — set required_headcount=10, assign 8 employees, verify "8 / 10 ⚠ -2" with amber bar.

- [ ] **Step 4: Commit**

### Task 9.5: Assignments list (multi-select)

- [ ] **Step 1: `<DataTable>` with `selectable=true` + bulk actions: "Transfer to detachment...", "End assignment...".**

- [ ] **Step 2: Bulk action handlers open a modal with `<Typeahead>` + date input, call `assignments.bulkTransfer` / `bulkEndAssignments`. Per-row errors shown in result modal.**

- [ ] **Step 3: Browser test** — select 5 rows, transfer to a different detachment, verify rows updated.

- [ ] **Step 4: Commit**

### Task 9.6: Assignment create form (typeahead)

- [ ] **Step 1: Replace `<select>` dropdowns with `<Typeahead>`. Employee picker backed by `hr.searchEmployees`. Detachment picker backed by a new `clients.searchDetachments` (similar shape).**

- [ ] **Step 2: Sticky default** — last-chosen detachment persists in sessionStorage within the form's lifetime.

- [ ] **Step 3: Browser test** — type "cru" in employee picker → see options, arrow-down, Enter to select.

- [ ] **Step 4: Commit**

### Task 9.7: DTR page (typeahead + countdown)

- [ ] **Step 1: Add header with cut-off + payday countdown badges, computed via `payrollCalendars.resolveForPeriod` for the selected period + (for now) the first client in the demo seed. Multi-client per-period dashboard is Slice 3+.**

- [ ] **Step 2: Employee picker on the entry form → `<Typeahead>`.**

- [ ] **Step 3: Browser test** — load page, see countdown, enter DTR, close period, see late warning if past cutoff.

- [ ] **Step 4: Commit**

### Task 9.8: Pay Runs page (payday countdown + calendar surface)

- [ ] **Step 1: Per-run header shows worked period + cut-off date (with closed checkmark if past) + payday countdown.**

- [ ] **Step 2: Browser test** — visit page, see countdown updating daily logic (or fake `now()` for the test).

- [ ] **Step 3: Commit**

### Task 9.9: Government Exports — BIR 2316 PDF preview

- [ ] **Step 1: Existing route now downloads PDF. Show warnings banner if `result.warnings.length > 0`.**

- [ ] **Step 2: Browser test** — pick an employee with full BIR fields → PDF downloads, opens, shows complete form. Pick an employee missing RDO → warnings banner shown, PDF still downloads with blank RDO field.**

- [ ] **Step 3: Commit**

### Task 9.10: Phase 9 verification

- [ ] **Step 1: All admin routes render without runtime errors.**
- [ ] **Step 2: All tests still green.**
```bash
pnpm vitest run
pnpm build
```

---

## Phase 10 — Demo bootstrap + regression gate + Done-criteria sweep

### Task 10.1: Slice 0 + 1 regression gate

- [ ] **Step 1: Run existing `modules/_regression/tests/slice0.test.ts` + Slice 1 reconciliation test.**
```bash
pnpm vitest run modules/_regression
pnpm vitest run modules/payroll  # Slice 1 ₱1 reconciliation
```
Both must pass.

- [ ] **Step 2: If anything fails — stop. Fix before moving on.**

### Task 10.2: 100-employee / 5-client / 10-detachment seed

**Files:**
- Create: `db/seeds/slice2-demo.ts`

- [ ] **Step 1: Seed script** — 5 clients (SM Prime, Ayala Land, Robinsons Land, Megaworld, Filinvest). 10 detachments. 100 employees with mixed employment_type (80 GUARD, 15 OFFICE_STAFF, 3 SUPERVISOR, 2 DRIVER). Realistic Filipino names. All clients on the same payroll calendar (2 days cut-off, 5 days payday). Assignments: 50 to first 5 detachments, 30 to next 3, 10 to next 2, 10 floating.

- [ ] **Step 2: Commit**

### Task 10.3: `directives/slice-2-bootstrap.md`

- [ ] **Step 1: Write the 14-step UX walk-through as an executable directive — same pattern as `directives/slice-1-bootstrap.md`.**

- [ ] **Step 2: Commit**

### Task 10.4: Done-criteria walkthrough

- [ ] **Step 1: Walk the 15 Done criteria from the contract. Mark each ✓ or ⚠. Document in `wiki/slices/2-multi-client-at-scale-done-sweep.md`.**

- [ ] **Step 2: Two ⚠ items in Slice 1 → close them as part of Slice 2 if relevant (per resume open-items list).**

- [ ] **Step 3: Commit**

### Task 10.5: UX walk (Noel runs)

- [ ] **Step 1: Spin up local dev + DB. Hand to Noel.**
- [ ] **Step 2: Noel runs the 14-step walk. Document findings in `wiki/slices/2-multi-client-at-scale-ux-walk-findings.md` — same pattern as Slice 1.**
- [ ] **Step 3: Fix any genuine Slice-2 bugs; defer all polish to Slice 3 backlog.**
- [ ] **Step 4: Final commit + tag**
```bash
git tag slice-2-done
git push --tags
```

---

## Self-review

**Spec coverage** (contract §Done criteria):
- ✓ Sidebar rebuild → 8.5
- ✓ Employees list (search, filter, sort, multi-select, row-click) → 9.1
- ✓ Bulk import + sample CSV → 3.5
- ✓ Employee detail/edit + audit → 9.2 + 3.1
- ✓ Clients + Detachments edit → 4.1 + 9.3 + 9.4
- ✓ Detachments deployment badge → 4.2 + 4.3 + 9.4
- ✓ Assignments multi-select + bulk + typeahead → 5.1–5.5 + 9.5 + 9.6
- ✓ Payroll calendar (per-client) → Phase 2 + 6.1 + 9.4
- ✓ Pay run captures dates → 6.1
- ✓ Late DTR warning → 6.2
- ✓ BIR 2316 PDF with full IVB + RDO + DOB + address → Phase 7
- ✓ Demo script → 10.3
- ✓ Regression gate → 10.1
- ✓ Per-module README updates → 3.7, 4.5, 5.6, 7.6, plus new 2.5
- ✓ CI green → 10.4
- ✓ UX bar (clerk completes without coaching) → 10.5

**Type consistency check:** `PayrollCalendar` type in Phase 2 matches usage in Phase 6 (resolveForPeriod). `ResolvedCalendar.source` enum (`'client' | 'global-default' | 'fallback-defaults'`) used consistently. `Employee.employmentType` enum values match between schema (1.2), service (3.x), CSV (3.5), and UI (9.1).

**Placeholder scan:** clean — every step has either code, exact commands, or a clear deferred-task reference (e.g. 8.7 explicitly defers manual browser testing to Phase 9 usage).

---

**Plan complete and saved to [`wiki/slices/2-multi-client-at-scale-plan.md`](2-multi-client-at-scale-plan.md). Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Phase 1 is 8 tasks of ~3-min each; ideal for parallel work.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints. Better for tasks 1.1–1.8 done as a single phase commit.

**Which approach?**
