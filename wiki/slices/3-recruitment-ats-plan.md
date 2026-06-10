# Recruitment ATS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Recruitment ATS — the HRIS front door — so a recruiter takes a person from "applied" through clearances to "hired," creating a real employee, with all past applicants retained and terminated/blacklisted guards flagged on re-apply.

**Architecture:** New `modules/recruitment` module (applicants + document checklist + blacklist) following the established module contract. Applicants are a **separate entity** from employees (ADR 0004); `recruitment.hireApplicant` calls `hr.createEmployee` (ADR 0009 handoff). A payroll zero-attendance guard ships **first** so a hired-but-undeployed employee never produces a phantom payslip. UI follows the Slice-2 PageShell/Pagination/ModalShell/Typeahead patterns; list-first (kanban deferred).

**Tech Stack:** Next.js (App Router, server components + server actions), TypeScript, Drizzle ORM + Postgres, Vitest (integration tests vs `sentinel_test`), Zod, `downshift` Typeahead.

**Spec:** [`wiki/slices/3-recruitment-ats.md`](3-recruitment-ats.md). Read it before starting.

**Branch:** `slice-3-recruitment` (already created off `slice-2-impl`).

**Conventions to mirror (read these first):**
- Module shape: [`modules/hr/index.ts`](../../modules/hr/index.ts), [`modules/hr/service.ts`](../../modules/hr/service.ts), [`modules/hr/schema.ts`](../../modules/hr/schema.ts), [`modules/hr/labels.ts`](../../modules/hr/labels.ts), [`modules/hr/README.md`](../../modules/hr/README.md).
- Audit + events in every mutation: see `modules/hr/service.ts` `createEmployee` (`audit.record` + `events.publish`).
- Tests: [`modules/hr/hr.test.ts`](../../modules/hr/hr.test.ts), [`modules/payroll/payroll.test.ts`](../../modules/payroll/payroll.test.ts) (fixture helpers `makeEmployee`, `makeDtrEntries`).
- UI list page: [`app/(admin)/employees/page.tsx`](../../app/%28admin%29/employees/page.tsx), body [`app/(admin)/employees/employees-list-body.tsx`](../../app/%28admin%29/employees/employees-list-body.tsx).
- Create form + action: [`app/(admin)/employees/new/`](../../app/%28admin%29/employees/new/).
- Modal: [`app/(admin)/employees/bulk-assign-modal.tsx`](../../app/%28admin%29/employees/bulk-assign-modal.tsx) + [`components/modal-shell.tsx`](../../components/modal-shell.tsx).
- Pagination: [`components/pagination.tsx`](../../components/pagination.tsx) + `parsePage`/`clampPageSize` helpers (find via grep).
- Typeahead: [`components/typeahead.tsx`](../../components/typeahead.tsx).

---

## File structure

**Create:**
- `modules/recruitment/schema.ts` — applicants, applicant_documents, blacklist tables + enums.
- `modules/recruitment/labels.ts` — stage/source/doc labels, `ALLOWED_TRANSITIONS`, `REQUIRED_DOCS`.
- `modules/recruitment/service.ts` — all business logic.
- `modules/recruitment/index.ts` — public surface (`recruitment` object).
- `modules/recruitment/README.md` — Purpose / Public API / Dependencies / Known failure modes.
- `modules/recruitment/recruitment.test.ts` — integration tests.
- `app/(admin)/recruitment/page.tsx` — applicants list (server component).
- `app/(admin)/recruitment/applicants-list-body.tsx` — client list table.
- `app/(admin)/recruitment/actions.ts` — server actions (create, advance, set-doc, hire, reject, withdraw).
- `app/(admin)/recruitment/new/page.tsx` + `new-applicant-form.tsx` — new applicant.
- `app/(admin)/recruitment/[id]/page.tsx` — applicant detail (profile + doc checklist + actions + match banner).
- `app/(admin)/recruitment/[id]/hire-modal.tsx` — hire form modal.
- `app/(admin)/recruitment/blacklist/page.tsx` + `blacklist-form.tsx` + `blacklist/actions.ts`.

**Modify:**
- `modules/payroll/service.ts` — add zero-attendance guard.
- `modules/hr/service.ts` + `modules/hr/index.ts` — add `generateNextEmployeeCode`.
- `app/(admin)/_nav.tsx` — add Recruitment section.

---

## Task 1: Payroll zero-attendance guard (de-risk the integration FIRST)

Why first: until payroll skips zero-attendance employees, any hired-but-undeployed employee gets a phantom-deduction payslip that leaks into government exports (spec §2). Build this before recruitment can create employees.

**Files:**
- Modify: `modules/payroll/service.ts` (the per-employee loop, ~line 89-105)
- Test: `modules/payroll/payroll.test.ts`

- [ ] **Step 1: Write the failing test** — add inside the existing top-level `describe` in `modules/payroll/payroll.test.ts` (uses existing `makeEmployee`/`makeDtrEntries`/`runPayroll`/`listPayslips` helpers):

```ts
it('does not create a payslip for an employee with zero attendance', async () => {
  // Employee exists and is 'hired' but has NO dtr entries this period.
  const emp = await makeEmployee('CG-90001', { salary: 18000 });
  // (deliberately no makeDtrEntries call)

  const run = await runPayroll('2026-06-01', '2026-06-15', { isFinalCutOfMonth: false });
  const slips = await listPayslips(run.id);

  expect(slips.find((s) => s.employeeId === emp.id)).toBeUndefined();
});

it('still pays an employee who worked', async () => {
  const emp = await makeEmployee('CG-90002', { salary: 18000 });
  await makeDtrEntries(emp.id, ['2026-06-02', '2026-06-03', '2026-06-04']);

  const run = await runPayroll('2026-06-01', '2026-06-15', { isFinalCutOfMonth: false });
  const slips = await listPayslips(run.id);

  expect(slips.find((s) => s.employeeId === emp.id)).toBeDefined();
});
```

- [ ] **Step 2: Run to verify the first test FAILS** (current code creates a slip for the zero-attendance employee):

Run: `pnpm test -- modules/payroll/payroll.test.ts -t "zero attendance"`
Expected: FAIL — the zero-attendance employee currently DOES get a payslip.

- [ ] **Step 3: Add the guard** in `modules/payroll/service.ts`, immediately after `daysWorked` is computed (after the `const otHours = 0;` line, before `const basicSalaryMonthly`):

```ts
      // No attendance in this period → no payslip. Prevents hired-but-undeployed
      // employees (e.g. fresh hires from Recruitment) from generating a phantom
      // payslip that carries statutory deductions into the SSS R-3 / BIR exports.
      // See wiki/slices/3-recruitment-ats.md §2.
      if (daysWorked === 0 && otHours === 0) {
        continue;
      }
```

- [ ] **Step 4: Run the new tests + the full payroll suite** to confirm the guard works and nothing regressed:

Run: `pnpm test -- modules/payroll/`
Expected: PASS. If any existing test relied on a 0-day employee producing a 0 payslip, update that test to reflect the new (correct) behavior and note it in the commit.

- [ ] **Step 5: Commit**

```bash
git add modules/payroll/service.ts modules/payroll/payroll.test.ts
git commit -m "fix(payroll): skip zero-attendance employees (no phantom payslip)"
```

---

## Task 2: Recruitment schema + enums + migration

**Files:**
- Create: `modules/recruitment/schema.ts`
- Generated: `drizzle/migrations/00NN_slice3_recruitment.sql` (via `pnpm db:generate`)

- [ ] **Step 1: Write `modules/recruitment/schema.ts`**

```ts
import { pgTable, pgEnum, uuid, text, date, boolean, timestamp } from 'drizzle-orm/pg-core';
import { employees, employmentType } from '@/modules/hr/schema';
import { users } from '@/modules/auth/schema';

// Cross-schema imports (employees, users, employmentType) follow the existing
// pattern — payroll/dtr/assignments all import employees from hr/schema for FKs.

export const recruitmentStage = pgEnum('recruitment_stage', [
  'applied', 'contacted', 'documents', 'hired', 'rejected', 'withdrawn',
]);

export const recruitmentSource = pgEnum('recruitment_source', [
  'walk_in', 'referral', 'agency', 'job_board', 'social_media',
  'provincial', 'training_school', 'other',
]);

export const recruitmentDocType = pgEnum('recruitment_doc_type', [
  'nbi_clearance', 'police_pnp_clearance', 'barangay_clearance', 'drug_test',
  'medical_exam', 'neuro_psych', 'training_cert_sbr_rtc', 'sosia_license',
  'ltopf_license', 'resume_biodata', 'other',
]);

export const recruitmentDocStatus = pgEnum('recruitment_doc_status', [
  'pending', 'submitted', 'verified', 'expired',
]);

export const applicants = pgTable('recruitment_applicants', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  middleName: text('middle_name'),
  lastName: text('last_name').notNull(),
  dateOfBirth: date('date_of_birth'),
  sssNumber: text('sss_number'),               // stable ID for matching (spec §5)
  phone: text('phone'),
  email: text('email'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  province: text('province'),
  source: recruitmentSource('source').notNull().default('walk_in'),
  positionAppliedFor: employmentType('position_applied_for').notNull().default('GUARD'),
  isArmedPost: boolean('is_armed_post').notNull().default(false),
  pipelineStage: recruitmentStage('pipeline_stage').notNull().default('applied'),
  appliedOn: date('applied_on').notNull(),
  hiredEmployeeId: uuid('hired_employee_id').references(() => employees.id),
  outcomeReason: text('outcome_reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const applicantDocuments = pgTable('recruitment_applicant_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicantId: uuid('applicant_id').notNull().references(() => applicants.id, { onDelete: 'cascade' }),
  docType: recruitmentDocType('doc_type').notNull(),
  status: recruitmentDocStatus('status').notNull().default('pending'),
  expiresOn: date('expires_on'),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id),
  verifiedOn: date('verified_on'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const blacklist = pgTable('recruitment_blacklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: date('date_of_birth'),
  sssNumber: text('sss_number'),
  reason: text('reason').notNull(),
  sourceEmployeeId: uuid('source_employee_id').references(() => employees.id),
  addedByUserId: uuid('added_by_user_id').references(() => users.id),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Applicant = typeof applicants.$inferSelect;
export type NewApplicant = typeof applicants.$inferInsert;
export type ApplicantDocument = typeof applicantDocuments.$inferSelect;
export type BlacklistEntry = typeof blacklist.$inferSelect;
```

- [ ] **Step 2: Confirm `employmentType` is exported from `modules/hr/schema.ts`**

Run: `grep -n "export const employmentType" modules/hr/schema.ts`
Expected: a match. If it's not exported, add `export` to its `pgEnum` declaration in a one-line edit (it must be importable for reuse).

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `drizzle/migrations/00NN_*.sql` containing `CREATE TYPE recruitment_*` and `CREATE TABLE recruitment_*`. Open it and sanity-check the three tables + four enums are present.

- [ ] **Step 4: Apply to dev DB and create/refresh the test DB**

Run: `pnpm db:migrate && pnpm db:test:setup`
Expected: both succeed; migrate logs the target DB.

- [ ] **Step 5: Commit**

```bash
git add modules/recruitment/schema.ts drizzle/migrations/ modules/hr/schema.ts
git commit -m "feat(recruitment): schema + migration (applicants, documents, blacklist)"
```

---

## Task 3: `modules/recruitment/labels.ts` (stage machine + required docs)

**Files:**
- Create: `modules/recruitment/labels.ts`

- [ ] **Step 1: Write the labels + state machine**

```ts
import type { Applicant, ApplicantDocument, BlacklistEntry } from './schema';

export type Stage = Applicant['pipelineStage'];
export type Source = Applicant['source'];
export type DocType = ApplicantDocument['docType'];
export type DocStatus = ApplicantDocument['status'];

export const STAGE_LABELS: Record<Stage, string> = {
  applied: 'Applied',
  contacted: 'Contacted',
  documents: 'Documents complete',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const SOURCE_LABELS: Record<Source, string> = {
  walk_in: 'Walk-in', referral: 'Referral', agency: 'Recruitment agency',
  job_board: 'Online job board', social_media: 'Social media',
  provincial: 'Provincial sourcing', training_school: 'Training school', other: 'Other',
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  nbi_clearance: 'NBI clearance',
  police_pnp_clearance: 'PNP / police clearance',
  barangay_clearance: 'Barangay clearance',
  drug_test: 'Drug test',
  medical_exam: 'Medical exam',
  neuro_psych: 'Neuro-psychological exam',
  training_cert_sbr_rtc: 'Security training cert (SBR/RTC)',
  sosia_license: 'SOSIA license',
  ltopf_license: 'LTOPF license (firearms)',
  resume_biodata: 'Resume / bio-data',
  other: 'Other',
};

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pending: 'Pending', submitted: 'Submitted', verified: 'Verified', expired: 'Expired',
};

/**
 * Stage state machine. `service.ts` enforces this on every advanceStage call;
 * the UI consults it to render only valid next options. Mirrors hr/labels.ts.
 * hired/rejected/withdrawn are terminal.
 */
export const ALLOWED_TRANSITIONS: Record<Stage, readonly Stage[]> = {
  applied: ['contacted', 'rejected', 'withdrawn'],
  contacted: ['documents', 'rejected', 'withdrawn'],
  documents: ['hired', 'rejected', 'withdrawn'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

/**
 * Required clearances before an applicant is "documents complete".
 * Standard PH security set (questionnaire D2.5/D5). LTOPF only for armed posts.
 * Editable here when the client confirms D5.
 */
const BASE_REQUIRED_DOCS: readonly DocType[] = [
  'nbi_clearance', 'police_pnp_clearance', 'barangay_clearance', 'drug_test',
  'medical_exam', 'neuro_psych', 'training_cert_sbr_rtc', 'sosia_license', 'resume_biodata',
];

export function requiredDocsFor(isArmedPost: boolean): readonly DocType[] {
  return isArmedPost ? [...BASE_REQUIRED_DOCS, 'ltopf_license'] : BASE_REQUIRED_DOCS;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add modules/recruitment/labels.ts
git commit -m "feat(recruitment): labels, stage machine, required-docs matrix"
```

---

## Task 4: `hr.generateNextEmployeeCode`

**Files:**
- Modify: `modules/hr/service.ts`, `modules/hr/index.ts`
- Test: `modules/hr/hr.test.ts`

- [ ] **Step 1: Write the failing test** (add to `modules/hr/hr.test.ts`):

```ts
it('generateNextEmployeeCode returns the next CG- code', async () => {
  await hr.createEmployee({ employeeCode: 'CG-10001', firstName: 'A', lastName: 'B', basicSalary: 18000, hiredOn: '2026-05-01' });
  await hr.createEmployee({ employeeCode: 'CG-10009', firstName: 'C', lastName: 'D', basicSalary: 18000, hiredOn: '2026-05-01' });
  const next = await hr.generateNextEmployeeCode('CG-');
  expect(next).toBe('CG-10010');
});

it('generateNextEmployeeCode starts at 10001 when none exist', async () => {
  const next = await hr.generateNextEmployeeCode('CG-');
  expect(next).toBe('CG-10001');
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm test -- modules/hr/hr.test.ts -t "generateNextEmployeeCode"`
Expected: FAIL — `hr.generateNextEmployeeCode is not a function`.

- [ ] **Step 3: Implement** in `modules/hr/service.ts` (append a new function):

```ts
/**
 * Returns the next employee code for a prefix by finding the max numeric suffix
 * among existing codes and incrementing. Pads to the existing width (5 digits,
 * matching the CG-10001 seed convention). Recruitment's hire flow uses this so
 * recruiters don't hand-type unique codes; the value remains overridable.
 */
export async function generateNextEmployeeCode(prefix = 'CG-'): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ code: employees.employeeCode })
    .from(employees)
    .where(sql`${employees.employeeCode} LIKE ${prefix + '%'}`);
  let max = 10000; // so first code is <prefix>10001
  for (const { code } of rows) {
    const suffix = Number(code.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > max) max = suffix;
  }
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}
```

Ensure `sql` is imported from `drizzle-orm` at the top of the file (it likely already is; if not, add it).

- [ ] **Step 4: Export it** — add `generateNextEmployeeCode` to the `hr` object and named exports in `modules/hr/index.ts`.

- [ ] **Step 5: Run to verify PASS**

Run: `pnpm test -- modules/hr/hr.test.ts -t "generateNextEmployeeCode"`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add modules/hr/service.ts modules/hr/index.ts modules/hr/hr.test.ts
git commit -m "feat(hr): generateNextEmployeeCode helper"
```

---

## Task 5: Recruitment service — createApplicant + listing/get

**Files:**
- Create/extend: `modules/recruitment/service.ts`
- Test: `modules/recruitment/recruitment.test.ts`

- [ ] **Step 1: Write the test file scaffold + first failing tests**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { closeDb, getDb } from '@/core/db';
import { applicants, applicantDocuments, blacklist } from './schema';
import { employees } from '@/modules/hr/schema';
import { recruitment } from './index';

describe('recruitment service', () => {
  beforeEach(async () => {
    const db = getDb();
    await db.delete(applicantDocuments);
    await db.delete(applicants);
    await db.delete(blacklist);
    await db.delete(employees); // hire tests create employees
  });
  afterAll(async () => { await closeDb(); });

  it('createApplicant defaults to applied and seeds the required-doc checklist', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'Ana', lastName: 'Reyes', source: 'referral', appliedOn: '2026-05-29',
    });
    expect(a.pipelineStage).toBe('applied');
    const docs = await recruitment.getApplicant(a.id);
    expect(docs?.documents.length).toBe(9); // unarmed base set
  });

  it('createApplicant for an armed post includes the LTOPF license', async () => {
    const a = await recruitment.createApplicant({
      firstName: 'B', lastName: 'C', source: 'walk_in', appliedOn: '2026-05-29', isArmedPost: true,
    });
    const got = await recruitment.getApplicant(a.id);
    expect(got?.documents.some((d) => d.docType === 'ltopf_license')).toBe(true);
    expect(got?.documents.length).toBe(10);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm test -- modules/recruitment/recruitment.test.ts`
Expected: FAIL — `recruitment` / functions undefined.

- [ ] **Step 3: Implement `createApplicant`, `getApplicant`, `listApplicantsPage`** in `modules/recruitment/service.ts`:

```ts
import { and, desc, eq, sql, ilike, or, inArray } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { applicants, applicantDocuments, blacklist, type Applicant, type ApplicantDocument } from './schema';
import { employees } from '@/modules/hr/schema';
import { hr } from '@/modules/hr';
import { requiredDocsFor, ALLOWED_TRANSITIONS, type Stage } from './labels';

export type CreateApplicantInput = {
  firstName: string; lastName: string; middleName?: string | null;
  dateOfBirth?: string | null; sssNumber?: string | null;
  phone?: string | null; email?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null; province?: string | null;
  source: Applicant['source']; positionAppliedFor?: Applicant['positionAppliedFor'];
  isArmedPost?: boolean; appliedOn: string; notes?: string | null;
  actorUserId?: string | null;
};

export async function createApplicant(input: CreateApplicantInput): Promise<Applicant> {
  const db = getDb();
  const [created] = await db.insert(applicants).values({
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    middleName: input.middleName ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    sssNumber: input.sssNumber ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    province: input.province ?? null,
    source: input.source,
    positionAppliedFor: input.positionAppliedFor ?? 'GUARD',
    isArmedPost: input.isArmedPost ?? false,
    appliedOn: input.appliedOn,
    notes: input.notes ?? null,
  }).returning();
  if (!created) throw new Error('[recruitment/createApplicant] insert returned no row');

  // Seed the required-doc checklist (pending).
  const docs = requiredDocsFor(created.isArmedPost).map((docType) => ({ applicantId: created.id, docType }));
  await db.insert(applicantDocuments).values(docs);

  await audit.record({
    actorUserId: input.actorUserId ?? null,
    action: 'recruitment.applicant.created',
    target: { kind: 'recruitment_applicant', id: created.id },
    payload: { name: `${created.firstName} ${created.lastName}` },
  });
  await events.publish('recruitment.applicant.created', { id: created.id });
  return created;
}

export async function getApplicant(id: string): Promise<{ applicant: Applicant; documents: ApplicantDocument[] } | null> {
  const db = getDb();
  const [a] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!a) return null;
  const documents = await db.select().from(applicantDocuments).where(eq(applicantDocuments.applicantId, id));
  return { applicant: a, documents };
}

export async function listApplicantsPage(opts: {
  query?: string; stage?: Stage; limit: number; offset: number;
}): Promise<{ rows: Applicant[]; total: number }> {
  const db = getDb();
  const filters = [];
  if (opts.query?.trim()) {
    const q = `%${opts.query.trim()}%`;
    filters.push(or(ilike(applicants.firstName, q), ilike(applicants.lastName, q), ilike(applicants.sssNumber, q)));
  }
  if (opts.stage) filters.push(eq(applicants.pipelineStage, opts.stage));
  const where = filters.length ? and(...filters) : undefined;
  const rows = await db.select().from(applicants).where(where)
    .orderBy(desc(applicants.appliedOn)).limit(opts.limit).offset(opts.offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(applicants).where(where);
  return { rows, total: count };
}
```

Note: `getApplicant` returns `{ applicant, documents }`. Keep this shape consistent everywhere (the test calls `got?.documents`).

- [ ] **Step 4: Create `modules/recruitment/index.ts`** exposing what exists so far:

```ts
import { createApplicant, getApplicant, listApplicantsPage } from './service';
export const recruitment = { createApplicant, getApplicant, listApplicantsPage };
export { createApplicant, getApplicant, listApplicantsPage };
export type { CreateApplicantInput } from './service';
```

- [ ] **Step 5: Run to verify PASS**

Run: `pnpm test -- modules/recruitment/recruitment.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/recruitment/service.ts modules/recruitment/index.ts modules/recruitment/recruitment.test.ts
git commit -m "feat(recruitment): createApplicant + checklist seeding + listing"
```

---

## Task 6: advanceStage + setDocument (+ reject/withdraw)

**Files:** Modify `modules/recruitment/service.ts`, `index.ts`, test.

- [ ] **Step 1: Failing tests**

```ts
it('advanceStage follows the allowed matrix', async () => {
  const a = await recruitment.createApplicant({ firstName: 'A', lastName: 'B', source: 'walk_in', appliedOn: '2026-05-29' });
  await recruitment.advanceStage(a.id, 'contacted');
  const got = await recruitment.getApplicant(a.id);
  expect(got?.applicant.pipelineStage).toBe('contacted');
});

it('advanceStage rejects an illegal transition', async () => {
  const a = await recruitment.createApplicant({ firstName: 'A', lastName: 'B', source: 'walk_in', appliedOn: '2026-05-29' });
  await expect(recruitment.advanceStage(a.id, 'hired')).rejects.toThrow(/cannot move/i);
});

it('setDocument marks a doc verified', async () => {
  const a = await recruitment.createApplicant({ firstName: 'A', lastName: 'B', source: 'walk_in', appliedOn: '2026-05-29' });
  await recruitment.setDocument(a.id, 'nbi_clearance', { status: 'verified', expiresOn: '2027-05-01' });
  const got = await recruitment.getApplicant(a.id);
  expect(got?.documents.find((d) => d.docType === 'nbi_clearance')?.status).toBe('verified');
});

it('reject is terminal and records the reason', async () => {
  const a = await recruitment.createApplicant({ firstName: 'A', lastName: 'B', source: 'walk_in', appliedOn: '2026-05-29' });
  await recruitment.rejectApplicant(a.id, 'failed neuro-psych');
  const got = await recruitment.getApplicant(a.id);
  expect(got?.applicant.pipelineStage).toBe('rejected');
  expect(got?.applicant.outcomeReason).toBe('failed neuro-psych');
});
```

- [ ] **Step 2: Run → FAIL.**

Run: `pnpm test -- modules/recruitment/recruitment.test.ts -t "advanceStage|setDocument|reject"`
Expected: FAIL (undefined functions).

- [ ] **Step 3: Implement** in `service.ts`:

```ts
export async function advanceStage(id: string, next: Stage, opts: { actorUserId?: string | null } = {}): Promise<Applicant> {
  const db = getDb();
  const [current] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!current) throw new Error('Applicant not found.');
  const allowed = ALLOWED_TRANSITIONS[current.pipelineStage];
  if (!allowed.includes(next)) {
    throw new Error(`Cannot move an applicant from ${current.pipelineStage} to ${next}.`);
  }
  const [updated] = await db.update(applicants)
    .set({ pipelineStage: next, updatedAt: new Date() }).where(eq(applicants.id, id)).returning();
  await audit.record({ actorUserId: opts.actorUserId ?? null, action: 'recruitment.applicant.stage_changed',
    target: { kind: 'recruitment_applicant', id }, payload: { from: current.pipelineStage, to: next } });
  await events.publish('recruitment.applicant.stage_changed', { id, from: current.pipelineStage, to: next });
  return updated!;
}

export async function setDocument(applicantId: string, docType: ApplicantDocument['docType'],
  patch: { status: ApplicantDocument['status']; expiresOn?: string | null; notes?: string | null; verifiedByUserId?: string | null },
): Promise<void> {
  const db = getDb();
  await db.update(applicantDocuments)
    .set({
      status: patch.status,
      expiresOn: patch.expiresOn ?? null,
      notes: patch.notes ?? null,
      verifiedByUserId: patch.verifiedByUserId ?? null,
      verifiedOn: patch.status === 'verified' ? new Date().toISOString().slice(0, 10) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(applicantDocuments.applicantId, applicantId), eq(applicantDocuments.docType, docType)));
}

async function endApplicant(id: string, stage: 'rejected' | 'withdrawn', reason: string, actorUserId?: string | null) {
  const db = getDb();
  const [current] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!current) throw new Error('Applicant not found.');
  if (!ALLOWED_TRANSITIONS[current.pipelineStage].includes(stage)) {
    throw new Error(`Cannot ${stage} an applicant who is already ${current.pipelineStage}.`);
  }
  const [updated] = await db.update(applicants)
    .set({ pipelineStage: stage, outcomeReason: reason, updatedAt: new Date() }).where(eq(applicants.id, id)).returning();
  await audit.record({ actorUserId: actorUserId ?? null, action: `recruitment.applicant.${stage}`,
    target: { kind: 'recruitment_applicant', id }, payload: { reason } });
  await events.publish(`recruitment.applicant.${stage}`, { id, reason });
  return updated!;
}

export const rejectApplicant = (id: string, reason: string, opts: { actorUserId?: string | null } = {}) =>
  endApplicant(id, 'rejected', reason, opts.actorUserId);
export const withdrawApplicant = (id: string, reason: string, opts: { actorUserId?: string | null } = {}) =>
  endApplicant(id, 'withdrawn', reason, opts.actorUserId);
```

Add all four (`advanceStage`, `setDocument`, `rejectApplicant`, `withdrawApplicant`) to `index.ts`.

- [ ] **Step 4: Run → PASS.** Run: `pnpm test -- modules/recruitment/recruitment.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/recruitment/ && git commit -m "feat(recruitment): advanceStage, setDocument, reject/withdraw"
```

---

## Task 7: checkMatches (blacklist + terminated auto-flag)

**Files:** Modify `service.ts`, `index.ts`, test.

- [ ] **Step 1: Failing tests**

```ts
it('checkMatches flags a terminated employee by SSS, then by name+DOB', async () => {
  const emp = await hr.createEmployee({ employeeCode: 'CG-20001', firstName: 'Juan', lastName: 'Dela Cruz', basicSalary: 18000, hiredOn: '2026-01-01', dateOfBirth: '1990-01-01', sssNumber: '34-1234567-8' });
  await hr.changeStatus(emp.id, 'terminated', 'AWOL');
  const bySss = await recruitment.checkMatches({ firstName: 'X', lastName: 'Y', sssNumber: '34-1234567-8' });
  expect(bySss.some((m) => m.kind === 'terminated_employee' && m.confidence === 'exact')).toBe(true);
  const byName = await recruitment.checkMatches({ firstName: 'Juan', lastName: 'Dela Cruz', dateOfBirth: '1990-01-01' });
  expect(byName.some((m) => m.kind === 'terminated_employee')).toBe(true);
});

it('checkMatches flags an active blacklist entry and returns nothing for a clean applicant', async () => {
  await recruitment.addToBlacklist({ firstName: 'Bad', lastName: 'Guy', dateOfBirth: '1985-05-05', reason: 'theft' });
  const hit = await recruitment.checkMatches({ firstName: 'Bad', lastName: 'Guy', dateOfBirth: '1985-05-05' });
  expect(hit.some((m) => m.kind === 'blacklist')).toBe(true);
  const clean = await recruitment.checkMatches({ firstName: 'Fresh', lastName: 'Face', dateOfBirth: '2000-01-01' });
  expect(clean.length).toBe(0);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `checkMatches` + blacklist writers in `service.ts`:

```ts
export type MatchKind = 'terminated_employee' | 'blacklist';
export type Match = {
  kind: MatchKind; confidence: 'exact' | 'possible';
  label: string; refId: string;
};

export async function checkMatches(input: {
  firstName: string; lastName: string; dateOfBirth?: string | null; sssNumber?: string | null;
}): Promise<Match[]> {
  const db = getDb();
  const matches: Match[] = [];
  const nameDob = (dob?: string | null) => dob && input.dateOfBirth
    ? (input.lastName.trim().toLowerCase() === '' ? false : true) : false;

  // Terminated employees
  const terminated = await db.select().from(employees).where(eq(employees.status, 'terminated'));
  for (const e of terminated) {
    if (input.sssNumber && e.sssNumber && e.sssNumber === input.sssNumber) {
      matches.push({ kind: 'terminated_employee', confidence: 'exact',
        label: `${e.lastName}, ${e.firstName} (${e.employeeCode}) — terminated`, refId: e.id });
    } else if (input.dateOfBirth && e.dateOfBirth === input.dateOfBirth &&
               e.lastName.trim().toLowerCase() === input.lastName.trim().toLowerCase()) {
      matches.push({ kind: 'terminated_employee', confidence: 'possible',
        label: `${e.lastName}, ${e.firstName} (${e.employeeCode}) — terminated`, refId: e.id });
    }
  }

  // Active blacklist
  const bl = await db.select().from(blacklist).where(eq(blacklist.active, true));
  for (const b of bl) {
    if (input.sssNumber && b.sssNumber && b.sssNumber === input.sssNumber) {
      matches.push({ kind: 'blacklist', confidence: 'exact', label: `${b.lastName}, ${b.firstName} — ${b.reason}`, refId: b.id });
    } else if (input.dateOfBirth && b.dateOfBirth === input.dateOfBirth &&
               b.lastName.trim().toLowerCase() === input.lastName.trim().toLowerCase()) {
      matches.push({ kind: 'blacklist', confidence: 'possible', label: `${b.lastName}, ${b.firstName} — ${b.reason}`, refId: b.id });
    }
  }
  return matches;
}

export async function addToBlacklist(input: {
  firstName: string; lastName: string; dateOfBirth?: string | null; sssNumber?: string | null;
  reason: string; sourceEmployeeId?: string | null; addedByUserId?: string | null;
}): Promise<void> {
  const db = getDb();
  const [created] = await db.insert(blacklist).values({
    firstName: input.firstName.trim(), lastName: input.lastName.trim(),
    dateOfBirth: input.dateOfBirth ?? null, sssNumber: input.sssNumber ?? null,
    reason: input.reason, sourceEmployeeId: input.sourceEmployeeId ?? null, addedByUserId: input.addedByUserId ?? null,
  }).returning();
  await audit.record({ actorUserId: input.addedByUserId ?? null, action: 'recruitment.blacklist.added',
    target: { kind: 'recruitment_blacklist', id: created!.id }, payload: { reason: input.reason } });
  await events.publish('recruitment.blacklist.added', { id: created!.id });
}

export async function listBlacklist(): Promise<typeof blacklist.$inferSelect[]> {
  return getDb().select().from(blacklist).where(eq(blacklist.active, true)).orderBy(desc(blacklist.createdAt));
}

export async function removeFromBlacklist(id: string, opts: { actorUserId?: string | null } = {}): Promise<void> {
  const db = getDb();
  await db.update(blacklist).set({ active: false, updatedAt: new Date() }).where(eq(blacklist.id, id));
  await audit.record({ actorUserId: opts.actorUserId ?? null, action: 'recruitment.blacklist.removed',
    target: { kind: 'recruitment_blacklist', id }, payload: {} });
}
```

(Delete the unused `nameDob` helper stub — left out; use the inline comparisons shown.) Add `checkMatches`, `addToBlacklist`, `listBlacklist`, `removeFromBlacklist` to `index.ts`.

- [ ] **Step 4: Run → PASS.** Run: `pnpm test -- modules/recruitment/recruitment.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/recruitment/ && git commit -m "feat(recruitment): checkMatches + blacklist writers"
```

---

## Task 8: hireApplicant handoff (the ADR 0009 contract)

**Files:** Modify `service.ts`, `index.ts`, test.

- [ ] **Step 1: Failing tests** (the headline behavior + payroll-safety assertion)

```ts
it('hireApplicant creates an employee, back-links, and is terminal', async () => {
  const a = await recruitment.createApplicant({
    firstName: 'Ana', lastName: 'Reyes', source: 'referral', appliedOn: '2026-05-29',
    dateOfBirth: '1994-03-12', sssNumber: '11-2222222-3',
  });
  await recruitment.advanceStage(a.id, 'contacted');
  await recruitment.advanceStage(a.id, 'documents');
  const emp = await recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-01' });
  expect(emp.employeeCode).toMatch(/^CG-\d{5}$/);
  expect(emp.status).toBe('hired');
  expect(emp.firstName).toBe('Ana');
  const got = await recruitment.getApplicant(a.id);
  expect(got?.applicant.pipelineStage).toBe('hired');
  expect(got?.applicant.hiredEmployeeId).toBe(emp.id);
});

it('a freshly-hired (undeployed) employee produces NO payslip', async () => {
  const a = await recruitment.createApplicant({ firstName: 'Z', lastName: 'Q', source: 'walk_in', appliedOn: '2026-05-29' });
  await recruitment.advanceStage(a.id, 'contacted');
  await recruitment.advanceStage(a.id, 'documents');
  const emp = await recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-01' });
  // import { runPayroll, listPayslips } from '@/modules/payroll';
  const run = await runPayroll('2026-06-01', '2026-06-15', { isFinalCutOfMonth: false });
  const slips = await listPayslips(run.id);
  expect(slips.find((s) => s.employeeId === emp.id)).toBeUndefined();
});
```

Add `import { runPayroll, listPayslips } from '@/modules/payroll';` to the test imports.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `hireApplicant`** in `service.ts`:

```ts
export type HireMeta = {
  basicSalary: number | string; hiredOn: string;
  employeeCode?: string; actorUserId?: string | null;
};

export async function hireApplicant(applicantId: string, meta: HireMeta) {
  const db = getDb();
  const [a] = await db.select().from(applicants).where(eq(applicants.id, applicantId));
  if (!a) throw new Error('Applicant not found.');
  if (a.pipelineStage !== 'documents') {
    throw new Error('Only applicants with completed documents can be hired.');
  }

  const employeeCode = meta.employeeCode ?? (await hr.generateNextEmployeeCode('CG-'));
  // Handoff per ADR 0009: Recruitment.hireApplicant → HR.createEmployee.
  const employee = await hr.createEmployee({
    employeeCode,
    firstName: a.firstName, middleName: a.middleName, lastName: a.lastName,
    basicSalary: meta.basicSalary, hiredOn: meta.hiredOn,
    employmentType: a.positionAppliedFor,
    email: a.email, phone: a.phone,
    dateOfBirth: a.dateOfBirth,
    addressLine1: a.addressLine1, addressLine2: a.addressLine2, city: a.city, province: a.province,
    sssNumber: a.sssNumber,
    actorUserId: meta.actorUserId ?? null,
  });

  // Back-link + mark hired (terminal).
  await db.update(applicants)
    .set({ pipelineStage: 'hired', hiredEmployeeId: employee.id, updatedAt: new Date() })
    .where(eq(applicants.id, applicantId));

  await audit.record({ actorUserId: meta.actorUserId ?? null, action: 'recruitment.applicant.hired',
    target: { kind: 'recruitment_applicant', id: applicantId }, payload: { employeeId: employee.id, employeeCode } });
  await events.publish('recruitment.applicant.hired', { id: applicantId, employeeId: employee.id });
  return employee;
}
```

Confirm `hr.createEmployee` accepts `sssNumber`/`dateOfBirth`/address fields (it does per the schema map — verify the `CreateEmployeeInput` type includes them; if a field isn't accepted, drop it from the call). Add `hireApplicant` + `HireMeta` to `index.ts`.

- [ ] **Step 4: Run → PASS** (both the handoff and the no-payslip assertion — the latter proves Task 1's guard holds end-to-end).

Run: `pnpm test -- modules/recruitment/recruitment.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/recruitment/ && git commit -m "feat(recruitment): hireApplicant → hr.createEmployee handoff (ADR 0009)"
```

---

## Task 9: Module README + full index surface

**Files:** Create `modules/recruitment/README.md`; finalize `modules/recruitment/index.ts`.

- [ ] **Step 1: Write `README.md`** with the four required sections (Purpose / Public API / Dependencies / Known failure modes) — model on `modules/hr/README.md`. Public API table lists every function; Dependencies lists `hr`, `audit`, `events`, `core/db`; Known failure modes seeds: "illegal stage transition → 'Cannot move…'", "hire before documents → 'Only applicants with completed documents…'".

- [ ] **Step 2: Verify index exports** match every public function used by tests + UI. Run `pnpm typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add modules/recruitment/ && git commit -m "docs(recruitment): module README + finalize public surface"
```

---

## Task 10: UI — Applicants list page + new-applicant form

**Files:** Create `app/(admin)/recruitment/page.tsx`, `applicants-list-body.tsx`, `actions.ts`, `new/page.tsx`, `new-applicant-form.tsx`.

**Pattern source:** copy the structure of `app/(admin)/employees/page.tsx` (+ `employees-list-body.tsx`) and `app/(admin)/employees/new/` almost verbatim, swapping `hr` calls for `recruitment` and columns for: Name, Position, Stage (chip via `STAGE_LABELS`), days-in-stage (compute from `appliedOn`/`updatedAt`), docs `n/total` (from `requiredDocsFor`), match `⚠` (call `checkMatches` per row in the server component — acceptable at current volume; note in code a TODO to batch when volume grows).

- [ ] **Step 1: Server list page** `app/(admin)/recruitment/page.tsx` — read `searchParams` (q, stage, page, size), call `recruitment.listApplicantsPage`, wrap in `<PageShell title="Applicants" description="Everyone who has applied — guards and office staff. Move them through screening; Hire creates their employee record." footerHint="Click a row to open, tick documents, and advance the stage." toolbar={<Link className="btn" href="/recruitment/new">+ New applicant</Link>} />`, render `<ApplicantsListBody>` + `<Pagination>`. Use `parsePage`/`clampPageSize` like the employees page.

- [ ] **Step 2: `applicants-list-body.tsx`** — client table mirroring `employees-list-body.tsx`; rows link to `/recruitment/[id]`; stage chip; `⚠` when a match exists (pass a `matchesById: Record<string, boolean>` computed server-side).

- [ ] **Step 3: `actions.ts`** — `'use server'`; `createApplicantAction(prev, formData)` with Zod validation (firstName, lastName, source, appliedOn required; sssNumber/dob optional), `getSessionFromCookie` guard, `recruitment.createApplicant`, `revalidatePath('/recruitment')`, `redirect('/recruitment/'+id)`. Mirror `app/(admin)/employees/new/actions.ts` error handling (NEXT_REDIRECT passthrough).

- [ ] **Step 4: `new/page.tsx` + `new-applicant-form.tsx`** — form with `useActionState`, fields per Step 3, `TwoCol` layout, submit button. Mirror `add-employee-form.tsx`.

- [ ] **Step 5: Typecheck + lint.** Run: `pnpm typecheck && pnpm lint`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/recruitment/" && git commit -m "feat(recruitment): applicants list + new-applicant form"
```

---

## Task 11: UI — Applicant detail (checklist + actions + hire modal)

**Files:** Create `app/(admin)/recruitment/[id]/page.tsx`, `hire-modal.tsx`; extend `actions.ts`.

- [ ] **Step 1: Detail server page** `[id]/page.tsx` — `recruitment.getApplicant(id)`; render profile (`Field`/`TwoCol`), a red match banner from `recruitment.checkMatches(...)` (with confidence wording), the document checklist (each row: `DOC_TYPE_LABELS`, status select, expiry), and action buttons (Advance ▸ valid next stages from `ALLOWED_TRANSITIONS`, Hire ▸, Reject, Withdraw). 404 via `notFound()` when null.

- [ ] **Step 2: Extend `actions.ts`** with `advanceStageAction`, `setDocumentAction`, `rejectAction`, `withdrawAction`, `hireAction` — each `getSessionFromCookie`-guarded, calls the matching service fn with `actorUserId: session.user.id`, `revalidatePath`. `hireAction` returns `{ kind:'ok'; employeeId }` or `{ kind:'error'; message }`.

- [ ] **Step 3: `hire-modal.tsx`** — `ModalShell`; pre-fill employee code (pass `defaultCode` from `hr.generateNextEmployeeCode` computed in the server page), inputs for base salary + hire date; on confirm call `hireAction`; on `{kind:'ok'}` show success with a link to `/employees/{employeeId}` and an "Assign to a detachment now →" link to `/assignments` (existing flow). Mirror `bulk-assign-modal.tsx`.

- [ ] **Step 4: Typecheck + lint.** Run: `pnpm typecheck && pnpm lint`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/recruitment/" && git commit -m "feat(recruitment): applicant detail, doc checklist, hire modal"
```

---

## Task 12: UI — Blacklist screen + nav entry

**Files:** Create `app/(admin)/recruitment/blacklist/page.tsx`, `blacklist-form.tsx`, `blacklist/actions.ts`; modify `app/(admin)/_nav.tsx`.

- [ ] **Step 1: Blacklist page** — `recruitment.listBlacklist()`, render a table (name, dob, reason, added) with a "Remove" action (`removeFromBlacklist`), and an "Add to blacklist" form (`blacklist-form.tsx`) calling `addToBlacklistAction` (Zod: firstName, lastName, reason required).

- [ ] **Step 2: Nav** — in `app/(admin)/_nav.tsx`, add a new section **above** "Operations":

```ts
  {
    heading: 'Recruitment',
    items: [
      { href: '/recruitment', label: 'Applicants', icon: '🧾' },
      { href: '/recruitment/blacklist', label: 'Blacklist', icon: '🚫' },
    ],
  },
```

- [ ] **Step 3: Typecheck + lint.** Run: `pnpm typecheck && pnpm lint`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/recruitment/" "app/(admin)/_nav.tsx" && git commit -m "feat(recruitment): blacklist screen + nav entry"
```

---

## Task 13: Full-suite green + browser walk + done-sweep

**Files:** none (verification) + `wiki/slices/3-recruitment-ats-done-sweep.md`.

- [ ] **Step 1: Full test suite.** Run: `pnpm test`. Expected: all green (recruitment + payroll guard + hr + untouched suites).
- [ ] **Step 2: Reseed demo data** (tests wiped it): `pnpm db:seed:slice2-demo`.
- [ ] **Step 3: Playwright walk** of the spec §1 demo script (login `admin@sentinel.local` / `admin-change-me`): create applicant → advance → tick docs → hire → confirm new employee at `/employees/[id]`; create a name-matching applicant → see ⚠ banner; search the full list. Screenshot each step and READ the screenshots (per the standing browser-verify rule).
- [ ] **Step 4: Write `wiki/slices/3-recruitment-ats-done-sweep.md`** — check each spec §1 done-test item + scope items; note anything deferred.
- [ ] **Step 5: Commit + push** (after Noel's OK):

```bash
git add wiki/slices/3-recruitment-ats-done-sweep.md && git commit -m "docs(slice-3): done-sweep"
# push uses noelferrer-01 (see reference_github_auth) then switch back
```

---

## Self-review (run before execution)

- **Spec coverage:** pipeline stages (T3/T6), applicant DB + retention (T2/T5/T10), doc checklist incl. armed LTOPF (T2/T3/T5/T11), blacklist + terminated auto-flag with SSS priority (T7/T11), hire→employee handoff (T8), payroll-safety guard (T1), nav/UI (T10–T12), demo done-test (T13). ✓ All spec §1/§2/§3/§4/§5 requirements map to a task.
- **Placeholder scan:** UI tasks (T10–T12) intentionally reference template files rather than reproducing 400+ lines of established-pattern React verbatim — the executor has the templates open in this codebase; core logic (schema/service/tests) is fully spelled out. No `TODO`/`TBD` in logic tasks.
- **Type consistency:** `getApplicant` returns `{ applicant, documents }` everywhere; `Stage`/`DocType` from `labels.ts`; `Match` shape used by T7 + T11; `hireApplicant(applicantId, HireMeta)` and `createApplicant(CreateApplicantInput)` signatures consistent across tasks.
- **Open decision (carried, non-blocking):** hire-creates-employee (ADR 0009) vs employee-at-deployment (ADR 0004) — built per ADR 0009, isolated to `hireApplicant`; lawyer can move it later.
```
