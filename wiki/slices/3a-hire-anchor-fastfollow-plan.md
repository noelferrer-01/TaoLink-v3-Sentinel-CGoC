# 3a fast-follow — HireModal ID capture (anchor at hire) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the provisional-applicant dead end — let the recruiter enter a government ID inside the Hire modal so the Person is anchored at hire, the one place the anchor is actually required.

**Architecture:** Spec = `wiki/slices/3a-person-identity-done-sweep.md` §5 (twice red-teamed). The hire **action** anchors the Person first (`persons.updatePerson` with `anchorIdType` + the matching ID field **together** — updatePerson never infers the anchor), then calls `recruitment.hireApplicant`, whose existing `assertAnchored` gate now passes. `updatePerson` gains the same 23505 plain-language wrap `createPerson` already has. The detail-page nudge switches from the stored `idPending` flag to the live `ident.anchorIdType` (always truthful, immune to the stale-flag trap) and stops pointing at a non-existent "Edit". No service-signature changes; `hireApplicant` is untouched.

**Tech Stack:** Next.js server actions + zod, Drizzle/Postgres, Vitest (DB-backed via `TEST_DATABASE_URL`), Playwright MCP for the browser walk.

**Files:**
- Modify: `modules/persons/service.ts` (updatePerson 23505 wrap, ~line 394)
- Test: `modules/persons/persons.test.ts` (new updatePerson duplicate-ID case)
- Test: `modules/recruitment/recruitment.test.ts` (anchor-at-hire regression pin)
- Modify: `app/(admin)/recruitment/actions.ts` (hireSchema + hireAction)
- Modify: `app/(admin)/recruitment/[id]/hire-modal.tsx` (ID fields when unanchored)
- Modify: `app/(admin)/recruitment/[id]/page.tsx` (truthful nudge + `needsId` prop)
- Docs: `modules/persons/README.md`, `modules/recruitment/README.md`, `wiki/slices/3a-person-identity-done-sweep.md` (§5 addendum)

---

### Task 1: persons.updatePerson — 23505 plain-language wrap

`createPerson` catches Postgres 23505 and rethrows plain language via `uniqueViolationMessage()`; `updatePerson` does not (raw `duplicate key value violates unique constraint "persons_sss_uq"` leaks to the recruiter). Fix in the module — "own your errors" rule.

- [x] **Step 1: Write the failing test** — in `modules/persons/persons.test.ts`, inside the existing `describe('updatePerson', …)` block (uses the suite's `cleanup()`/imports as-is):

```ts
it('rethrows a duplicate unique ID as plain language (23505 wrap)', async () => {
  await createPerson({
    firstName: 'Already', lastName: 'OnFile',
    anchorIdType: 'sss', sssNumber: '34-UPD-23505',
  });
  const p = await createPerson({ firstName: 'New', lastName: 'Hire' }); // provisional

  await expect(
    updatePerson(p.id, { anchorIdType: 'sss', sssNumber: '34-UPD-23505' }),
  ).rejects.toThrow(/SSS number is already on file/i);
});
```

- [x] **Step 2: Run it — expect FAIL**

Run: `pnpm vitest run modules/persons/persons.test.ts -t "23505 wrap"`
Expected: FAIL — the rejection message is the raw Postgres `duplicate key value…` error, not the plain-language regex.

- [x] **Step 3: Implement** — in `modules/persons/service.ts` `updatePerson`, wrap the UPDATE (currently ~line 394) in the same catch used by `createPerson`:

```ts
  let updated: Person | undefined;
  try {
    [updated] = await db
      .update(persons)
      .set({ ...safePatch, updatedAt: new Date() })
      .where(eq(persons.id, id))
      .returning();
  } catch (err: unknown) {
    const plain = uniqueViolationMessage(err);
    if (plain) throw new Error(plain);
    throw err;
  }
  if (!updated) throw new Error(`[persons/updatePerson] update returned no row for ${id}`);
```

(The rest of the function — `changedFields`, audit, event — is unchanged; `updated` is non-null after the guard so no other edits are needed.)

- [x] **Step 4: Run the persons suite — expect PASS**

Run: `pnpm vitest run modules/persons/persons.test.ts`
Expected: all green, including the new test.

- [x] **Step 5: Commit**

```bash
git add modules/persons/service.ts modules/persons/persons.test.ts
git commit -m "fix(persons): updatePerson rethrows duplicate-ID 23505 in plain language"
```

### Task 2: recruitment — anchor-at-hire regression pin

Pins the exact contract the hire action will rely on: a provisional applicant whose Person is anchored via `updatePerson({ anchorIdType, <idField> })` clears `assertAnchored` and hires. **Expected green immediately** (the path is proven by `persons.test.ts:307-315`); this is a regression pin, not red/green TDD — it guards the cross-module contract the UI depends on.

- [x] **Step 1: Write the test** — in `modules/recruitment/recruitment.test.ts`, append to the `describe('recruitment.hireApplicant — T11: hire gate', …)` block. Add `updatePerson` to the existing `@/modules/persons` import at the top of the file (the file already imports from it; extend that import).

```ts
it('hires a provisional applicant once the Person is anchored via updatePerson (HireModal path)', async () => {
  const a = await recruitment.createApplicant({
    firstName: 'Provisional', lastName: 'Hire',
    source: 'walk_in', appliedOn: '2026-06-01',
    // no ID → anchorIdType 'none'
  });
  await recruitment.advanceStage(a.id, 'contacted');
  await recruitment.advanceStage(a.id, 'documents');

  // The HireModal path: anchor type + ID value set TOGETHER, then hire.
  await updatePerson(a.personId, { anchorIdType: 'sss', sssNumber: '34-HMOD-001' });

  const emp = await recruitment.hireApplicant(a.id, { basicSalary: 18000, hiredOn: '2026-06-10' });
  expect(emp.status).toBe('hired');
  expect(emp.personId).toBe(a.personId);
});
```

- [x] **Step 2: Run — expect PASS (regression pin)**

Run: `pnpm vitest run modules/recruitment/recruitment.test.ts -t "HireModal path"`
Expected: PASS. (If it fails, STOP — the spec's core assumption is wrong; re-read done-sweep §5 before touching UI.)

- [x] **Step 3: Commit**

```bash
git add modules/recruitment/recruitment.test.ts
git commit -m "test(recruitment): pin anchor-at-hire contract for the HireModal path"
```

### Task 3: hireAction — optional government-ID capture

The action layer has no test harness (module suites only); this task is verified by `pnpm typecheck` plus Task 6's browser walk.

- [x] **Step 1: Extend imports + schema** — in `app/(admin)/recruitment/actions.ts`. Add `updatePerson` to the persons import (line 8):

```ts
import { findPersonByAnyId, findPossibleDuplicates, updatePerson, ANCHOR_ID_LABELS, type AnchorIdType } from '@/modules/persons';
```

Extend `hireSchema` (reuses the file's existing `ID_TYPES` const):

```ts
const hireSchema = z.object({
  applicantId: z.string().min(1),
  employeeCode: z.string().trim().min(1, 'Employee code is required.'),
  basicSalary: z.string().trim().refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'Monthly basic salary must be a positive number.'),
  hiredOn: z.string().trim().regex(DATE_RE, 'Date hired must be in YYYY-MM-DD format.'),
  // Optional government ID — shown by the modal only when the Person is
  // unanchored; anchors the Person right before the hire gate.
  idType: z.enum(ID_TYPES).optional().or(z.literal('')),
  idValue: z.string().trim().optional().or(z.literal('')),
});
```

- [x] **Step 2: Parse + anchor before hiring** — in `hireAction`, add the two fields to the `safeParse` input:

```ts
    idType: formData.get('idType') ?? '',
    idValue: formData.get('idValue') ?? '',
```

Then, after `const d = parsed.data;` and before the existing `try`, insert (mirrors `createApplicantAction`'s pairing rule):

```ts
  const idValue = blank(d.idValue ?? null);
  const idType = (d.idType ?? '') as '' | (typeof ID_TYPES)[number];
  if (idValue && !idType) {
    return { kind: 'error', message: 'Pick which kind of ID you entered (PhilSys, SSS, TIN, …) — or clear the ID field.' };
  }
```

And at the top of the existing `try` block, before `recruitment.hireApplicant`:

```ts
    // Anchor the Person first so the hire gate (assertAnchored) passes.
    // anchorIdType + the ID value must go TOGETHER — updatePerson never infers
    // the anchor from a bare ID value (done-sweep §5).
    if (idType && idValue) {
      const got = await recruitment.getApplicant(d.applicantId);
      if (!got) return { kind: 'error', message: 'This applicant no longer exists.' };
      await updatePerson(
        got.applicant.personId,
        { anchorIdType: idType, [ID_FIELD[idType]]: idValue },
        session.user.id,
      );
    }
```

- [x] **Step 3: Plain-language catch for the duplicate-ID case** — in the same `catch`, extend the message ladder (the `updatePerson` wrap from Task 1 already produces the plain message; just let it through with hire context):

```ts
    const message = raw.includes('hr_employees_code') || raw.includes('employee_code')
      ? 'That employee code is already used — pick a different one.'
      : raw.includes('already on file for another person')
      ? `${raw} Use Look up on the intake page to find the existing record before hiring.`
      : raw.includes('government ID is required')
      ? 'A government ID is required before hiring. Enter it in the ID fields above, then confirm again.'
      : `Couldn't hire: ${raw}`;
```

(Note the `government ID is required` copy changes too — the ID field now lives in this very modal.)

- [x] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (Object computed key `[ID_FIELD[idType]]` is typed `string`; if tsc complains about the patch type, build the patch as `{ anchorIdType: idType, [ID_FIELD[idType]]: idValue } as Parameters<typeof updatePerson>[1]`.)

- [x] **Step 5: Commit**

```bash
git add "app/(admin)/recruitment/actions.ts"
git commit -m "feat(recruitment): hireAction anchors the Person from modal ID fields before the hire gate"
```

### Task 4: HireModal — ID fields when the Person is unanchored

- [x] **Step 1: Add the fields** — `app/(admin)/recruitment/[id]/hire-modal.tsx`. New prop `needsId: boolean`; local `idType` state gates the number input (same pattern as intake). Labels come from `@/modules/persons/labels` (client-safe pure constants — NOT the module index, which drags server DB code into the client bundle):

```tsx
'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ModalShell } from '@/components/modal-shell';
import { ANCHOR_ID_LABELS, ID_TYPE_LADDER, checkIdFormat, type AnchorIdType } from '@/modules/persons/labels';
import { hireAction, type HireState } from '../actions';

const initial: HireState = { kind: 'idle' };

export function HireModal({
  applicantId,
  defaultCode,
  today,
  readyToHire,
  needsId,
}: {
  applicantId: string;
  defaultCode: string;
  today: string;
  readyToHire: boolean;
  needsId: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(hireAction, initial);
  const [idType, setIdType] = useState<'' | AnchorIdType>('');
  const [idValue, setIdValue] = useState('');

  // Advisory only — warns on an odd-looking number, never blocks (same contract as intake).
  const idWarning = needsId && idType && idValue.trim() ? checkIdFormat(idType, idValue.trim()) : null;
```

Inside the `<form id="hire-form" …>`, directly after the `{!readyToHire && …}` note, add:

```tsx
              {needsId && (
                <div className="card" style={{ background: 'var(--paper-2)', display: 'grid', gap: '0.75rem' }}>
                  <div>
                    <div className="field-label" style={{ margin: 0 }}>Government ID — required to hire</div>
                    <p className="field-hint" style={{ margin: '0.25rem 0 0' }}>
                      This applicant has no government ID on file yet. Enter one here — it's saved to their identity record as part of the hire.
                    </p>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="h-idtype">ID type</label>
                    <select
                      id="h-idtype" name="idType" className="input" required
                      value={idType} onChange={(e) => setIdType(e.target.value as '' | AnchorIdType)}
                    >
                      <option value="">— pick an ID type —</option>
                      {ID_TYPE_LADDER.map((t) => <option key={t} value={t}>{ANCHOR_ID_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="h-idvalue">ID number</label>
                    <input
                      id="h-idvalue" name="idValue" className="input" required
                      disabled={idType === ''} value={idValue} onChange={(e) => setIdValue(e.target.value)}
                    />
                    {idType === '' && <span className="field-hint">Pick an ID type first.</span>}
                  </div>
                  {idWarning && <p className="field-hint" style={{ color: 'var(--ochre)', margin: 0 }}>⚠ {idWarning}</p>}
                </div>
              )}
```

(Everything else in the file is unchanged.)

- [x] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: one error — `page.tsx` doesn't pass `needsId` yet. That's Task 5; if there are OTHER errors, fix them here first.

- [x] **Step 3: Hold the commit** — commit lands with Task 5 (the two files only compile together).

### Task 5: Detail page — truthful nudge + `needsId`

- [x] **Step 1: Edit `app/(admin)/recruitment/[id]/page.tsx`.** Replace the nudge block (lines 91-103) — condition now reads the **live Person anchor**, not the stored flag (the page is the only UI reader of `idPending`, so nothing else consumes the stored flag), and the copy points at the real action:

```tsx
      {/* "ID still needed" nudge — provisional applicants can move through the
          pipeline, but a government ID is required before hiring. Never blocks.
          Derived from the live Person anchor so it can never go stale. */}
      {isActive && ident.anchorIdType === 'none' && (
        <div style={{
          border: '1px solid var(--ochre)', background: 'rgba(184, 134, 47, 0.10)',
          borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem',
          color: 'var(--ochre)', fontSize: '0.875rem',
        }}>
          <strong>Government ID still needed.</strong>{' '}
          You can keep screening this applicant, but a PhilSys, SSS, or TIN number must be on file before they can be hired.
          {' '}You'll be asked to enter it at the <strong>Hire</strong> step.
        </div>
      )}
```

And the `HireModal` call (line 183):

```tsx
              <HireModal applicantId={a.id} defaultCode={defaultCode} today={a.appliedOn} readyToHire={allVerified} needsId={ident.anchorIdType === 'none'} />
```

- [x] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [x] **Step 3: Commit Tasks 4+5 together**

```bash
git add "app/(admin)/recruitment/[id]/hire-modal.tsx" "app/(admin)/recruitment/[id]/page.tsx"
git commit -m "feat(recruitment): capture government ID in the Hire modal; truthful provisional nudge"
```

### Task 6: Full verify — suite + browser walk

- [x] **Step 1: Full gate**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: suite ≥ 325 passing (323 + 2 new), typecheck clean, lint clean (2 known pre-existing warnings only).

- [x] **Step 2: Browser walk (Playwright MCP)** — dev server `pnpm dev` (port 3000), login `admin@sentinel.local` / `admin-change-me`:
  1. `/recruitment/new` → create a walk-in with name + DOB, **no ID** → save.
  2. Detail page: screenshot — nudge says "You'll be asked to enter it at the **Hire** step" (no dead "Edit" pointer).
  3. Advance to Contacted → Documents → open **Hire** modal: screenshot — Government ID section present with type picker + number field.
  4. Confirm hire WITHOUT an ID → browser blocks on `required` (or server returns plain error). Enter SSS type + a test number → Confirm → expect "✓ Hired as CG-…".
  5. Screenshot the success state; open the new employee page — the SSS number is on the Person.
  6. READ every screenshot with the Read tool (feedback memory: subagent gates miss visual bugs).
  7. Clean up: delete the test employee + applicant (restore dev DB to its prior counts).

- [x] **Step 3: Docs** — same commit or a follow-up:
  - `modules/recruitment/README.md`: remove/replace the "anchor + idPending gap" note — the hire path now captures the ID; nudge derives from the live anchor.
  - `modules/persons/README.md`: updatePerson now rethrows 23505 in plain language (Known failure modes entry).
  - `wiki/slices/3a-person-identity-done-sweep.md`: §5 addendum — "Resolved by HireModal-minimum (commits …); full screening-time editor still gated on the Commander SOP answer."

```bash
git add modules/recruitment/README.md modules/persons/README.md wiki/slices/3a-person-identity-done-sweep.md wiki/slices/3a-hire-anchor-fastfollow-plan.md
git commit -m "docs: close the provisional-applicant gap record; 23505 failure mode on updatePerson"
```

---

**Out of scope (unchanged decisions):** full screening-time identity editor (gated on Commander SOP), `computeIdPending` exposure (moot on this path — the applicant goes terminal at hire), `hireApplicant` signature changes, ILIKE escape, T12b.
