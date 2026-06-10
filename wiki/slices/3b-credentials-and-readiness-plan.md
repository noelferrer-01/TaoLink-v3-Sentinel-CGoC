# Slice 3b — Credentials & Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.
> **Prerequisite:** Slice **3a** ([3a plan](3a-person-identity-plan.md)) is merged — `persons` exists, employees carry `personId` + `isArmedPost`. This slice is **additive** (new table + new surfaces); it does not change the identity foundation and does not block the slice-3 tag.

**Goal:** Give the Person a durable licence wallet that hire fills from verified clearances, and a readiness radar that flags guards **missing or expiring** a *required* licence.

**Architecture:** New `person_credentials` table on the Person. Hire carries verified `recruitment_applicant_documents` → credentials. Readiness uses a **credential** required set (NOT the applicant document checklist), derived from the employee's `isArmedPost`. Implements [ADR 0018](../decisions/0018-credentials-first-class.md); design [3-identity-and-credentials](3-identity-and-credentials.md).

**Tech Stack:** as 3a.

> **Deltas folded in after the backlog sweep (2026-06-11), confirmed against shipped code:**
> 1. **Migration is `0026`, not `0025`** — `0025` was consumed by the T12b legacy-column drop. `person_credentials` is a plain additive `CREATE TABLE`; no destructive gating / abort-test needed (unlike 0025).
> 2. **`credType` enum holds only the 9 credential-bearing doc-type spellings** (`nbi_clearance`, `police_pnp_clearance`, `barangay_clearance`, `drug_test`, `medical_exam`, `neuro_psych`, `training_cert_sbr_rtc`, `sosia_license`, `ltopf_license`) — **excludes `resume_biodata` and `other`** (not credentials). The doc→cred map in hire (T4) covers all `recruitmentDocType` values but skips those two; the round-trip test guards against a silent gap.
> 3. **`employees.isArmedPost` is nullable** in the shipped schema (design assumed always-set). Readiness treats `null` as **unarmed** (`isArmedPost ?? false`) so a legacy guard with no post-type isn't wrongly flagged for LTOPF.

---

### Task 1: `person_credentials` schema + credential labels (migration 0026)

**Files:** Modify `modules/persons/schema.ts`, `modules/persons/labels.ts`; migration `0026_person_credentials.sql`.

- [ ] **Step 1:** `person_credentials` per [contract §5a / ADR 0018](../decisions/0018-credentials-first-class.md): `personId → persons (cascade)`, `credType` enum **using the 9 credential-bearing recruitment doc-type spellings incl. `police_pnp_clearance`** (excludes `resume_biodata`/`other` — see delta 2), `credNumber`, `issuingBody`, `issuedOn`, `expiresOn`, `status` enum (`valid`/`expired`/`pending`/`revoked`), `verifiedByUserId → users (set null)`, `verifiedOn`, `notes`, timestamps. Index `personId` (FK join hot path).
- [ ] **Step 2:** Add to `labels.ts`: `CRED_TYPE_LABELS`, `CRED_STATUS_LABELS`, and
```ts
export type CredState = 'valid' | 'expiring' | 'expired' | 'revoked' | 'pending';
export function deriveCredState(expiresOn: string | null, status: string, today: string, windowDays = 60): CredState {
  if (status === 'revoked') return 'revoked';        // kept DISTINCT from expired
  if (status === 'pending') return 'pending';
  if (!expiresOn) return 'valid';
  if (expiresOn < today) return 'expired';
  return (Date.parse(expiresOn) - Date.parse(today)) <= windowDays * 86_400_000 ? 'expiring' : 'valid';
}
// Required CREDENTIALS for readiness — licences/clearances only; NOT the applicant doc checklist (which includes resume_biodata).
export const READINESS_CRED_SET = (isArmedPost: boolean): readonly CredType[] => {
  const base = ['nbi_clearance','police_pnp_clearance','barangay_clearance','drug_test','medical_exam','neuro_psych','training_cert_sbr_rtc','sosia_license'] as const;
  return isArmedPost ? [...base, 'ltopf_license'] : base;   // note: excludes resume_biodata by design
};
// Per-credential renewal windows (days) for the radar — not one-size.
export const CRED_WINDOW_DAYS: Partial<Record<CredType, number>> = { ltopf_license: 90, sosia_license: 90, nbi_clearance: 60, drug_test: 30 };
```
- [ ] **Step 3:** `pnpm db:generate`/`migrate`; `pnpm typecheck`. **Step 4: Commit** — `feat(persons): person_credentials schema + credential labels (0025)`

---

### Task 2: Credentials service — add / update / list

**Files:** Modify `modules/persons/service.ts`, `persons.test.ts`

- [ ] **Step 1: Failing tests** — `addCredential`/`updateCredential`/`listCredentials` insert+audit+return; `deriveCredState` cases incl. **`revoked` stays `revoked`** (not `expired`).
- [ ] **Step 2: fail. Step 3: Implement** (audit `person.credential.added/updated`). **Step 4: pass. Step 5: Commit** — `feat(persons): credentials add/update/list`

---

### Task 3: `listReadinessIssues` — missing + expiring vs the credential required set

**Files:** Modify `modules/persons/service.ts`, test

- [ ] **Step 1: Failing tests:**
  - Armed employee (person + `isArmedPost=true`) with **no LTOPF row** → a `missing` issue.
  - SOSIA expiring within its window → an `expiring` issue.
  - A `resume_biodata`-less guard does **NOT** get a phantom "missing résumé" (README_CRED_SET excludes it).
  - A present LTOPF returns state `valid` **plus a `firearmLinkUnverified: true` flag** (never a clean all-clear).
  - Unarmed fully-valid guard → no issues.
- [ ] **Step 2: fail. Step 3: Implement** `listReadinessIssues({ windowDays?, armedOnly?, limit, offset })` — for each linked guard: required set = `READINESS_CRED_SET(employee.isArmedPost)`; diff vs present `valid`/`expiring` credentials; emit `{ kind:'missing'|'expiring'|'expired'|'revoked', credType, expiresOn?, employeeCode, personId, firearmLinkUnverified? }`; per-credential window via `CRED_WINDOW_DAYS` (fallback `windowDays`); order missing-first then soonest. `{ rows, total }`.
- [ ] **Step 4: pass. Step 5: Commit** — `feat(persons): readiness radar (missing+expiring, credential set, LTOPF caveat)`

---

### Task 4: Hire carries verified clearances → credentials (round-trip tested)

**Files:** Modify `modules/recruitment/service.ts` (`hireApplicant`); test

- [ ] **Step 1: Failing tests** — hiring an applicant with verified `sosia_license` (exp 2027-02-01) + `ltopf_license` + a `resume_biodata` → `person_credentials` gets sosia + ltopf with the right `expiresOn`, and **`resume_biodata` is skipped**; a **round-trip test asserts every verified non-`resume_biodata` doc type maps to a credential** (guards against a silent map gap, e.g. the `police_pnp_clearance` spelling).
- [ ] **Step 2: fail. Step 3: Implement** — after the hire links the Person, load verified `recruitment_applicant_documents`, map `recruitmentDocType → credType` (identity spelling; skip `resume_biodata` + `other`-as-needed), `persons.addCredential` each.
- [ ] **Step 4: pass.** Payroll suite still green. **Step 5: Commit** — `feat(recruitment): hire carries verified clearances into person credentials`

---

### Task 5: UI — employee Licences & clearances panel

**Files:** `app/(admin)/employees/[id]/` (+ add/edit-licence modal `ModalShell`).

- [ ] **Step 1:** Load `listCredentials` + compute the missing-required set (`READINESS_CRED_SET(isArmedPost)`) → render §3b-i with Valid/Expiring/Expired/**Revoked**/**MISSING (required)** chips and the LTOPF "firearm link unverified" note. Add/edit via `addCredential`/`updateCredential` actions.
- [ ] **Step 2:** typecheck green. **Step 3: Commit** — `feat(employees-ui): licences & clearances panel`

---

### Task 6: UI — readiness radar + nav

**Files:** Create `app/(admin)/recruitment/readiness/page.tsx`; modify nav.

- [ ] **Step 1:** Page → `listReadinessIssues({ windowDays, armedOnly })` with window (30/60/90) + armed filter + Slice-2 `Pagination` (§3b-ii). **Step 2:** Add "Licence readiness" to the Recruitment nav.
- [ ] **Step 3:** typecheck green. **Step 4: Commit** — `feat(recruitment-ui): licence readiness radar + nav`

---

### Task 7: Verify 3b

**Files:** update `modules/persons/README.md`, `modules/recruitment/README.md`; `wiki/slices/3b-credentials-and-readiness-done-sweep.md`.

- [ ] **Step 1:** `pnpm test && pnpm typecheck && pnpm lint` green.
- [ ] **Step 2:** Playwright walk of the §4 (3b) steps: hire → licences on the employee → a `MISSING (required)` row for an armed guard with no LTOPF → readiness radar lists missing/expiring. Screenshot + **Read** each.
- [ ] **Step 3:** READMEs + done-sweep. **Step 4: Commit** — `docs(persons): credentials README + 3b done-sweep`

---

## Self-Review

**Coverage vs [contract §7 (3b)](3-identity-and-credentials.md):** #9 T4 (round-trip map test) · #10 T1/T5 (states incl. Revoked + MISSING; LTOPF caveat) · #11 T3/T6 (readiness via `isArmedPost`, per-credential window) · #12 T7. ✅

**Round-2 fixes embedded:** readiness uses a *credential* set excluding `resume_biodata` (T1/T3) · `revoked` distinct from `expired` (T1) · `police_pnp_clearance` literal + round-trip map test (T1/T4) · `isArmedPost` from the employee so legacy guards aren't blind (T3, sourced in 3a) · LTOPF "firearm link unverified" (T3/T5) · per-credential windows (T1/T3).

**Placeholders:** real code for `deriveCredState`/`READINESS_CRED_SET`/`CRED_WINDOW_DAYS` (T1). UI references proven patterns. No TBD.
