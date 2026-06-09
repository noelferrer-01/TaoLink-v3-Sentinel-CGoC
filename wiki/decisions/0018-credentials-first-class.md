# 0018 — Licences & clearances are first-class, durable, expiry-tracked records on the Person

**Status:** RESOLVED (2026-06-10) — Noel locked "Decision A"; refined through two review rounds the same day. This is v3.
**Filed:** 2026-06-10
**Pairs with:** [0017](0017-person-centric-identity.md) (credentials hang off the Person).
**Touches:** recruitment documents, the hire handoff, a credentials surface on the employee/person, deployment-readiness (future).
**Delivered in:** Slice **3b** (additive; lands after the 3a identity spine — see [0017](0017-person-centric-identity.md) "Phasing").

## Context

Slice 3 records an applicant's clearances (NBI, drug test, SOSIA, LTOPF, …) as `recruitment_applicant_documents` — status + `expiresOn` — **stapled to the applicant**. At hire **none carries over**: the employee has no licence data. For a security agency that is a hole in the core regulatory duty — SOSIA licensing and **LTOPF firearms requalification** require knowing, per guard, *which licence expires when*. The data is captured at intake and orphaned at hire.

## Options

**A. Re-capture on the employee by hand later.** Re-keying, drift, side spreadsheet. **B. Copy applicant documents to the employee as flat fields.** No renewal history, not reusable. **C. First-class `Credential`** on the **Person** that hire fills from the verified clearances. Durable, survives rehire, expiry-tracked.

## Resolution

**Option C.** A **`person_credentials`** table keyed to the Person:
- `credType` — **mirrors the existing recruitment doc-type enum literally** (`nbi_clearance`, `police_pnp_clearance`, `barangay_clearance`, `drug_test`, `medical_exam`, `neuro_psych`, `training_cert_sbr_rtc`, `sosia_license`, `ltopf_license`, `other`). *(Use the source enum's exact spelling — `police_pnp_clearance`, not `pnp_clearance` — so the document→credential map can't silently drop a type. Hire includes a round-trip test that every verified non-`resume_biodata` doc lands as a credential.)*
- `credNumber`, `issuingBody`, `issuedOn`, `expiresOn`, `status` (`valid` | `expired` | `pending` | `revoked`), `verifiedByUserId`, `verifiedOn`, `notes`.
- **State is derived** from `expiresOn` vs today: `valid` / `expiring` (inside a window, default 60d) / `expired`. **`revoked` is surfaced as its own state, never collapsed into `expired`** (a revoked firearms licence is a different, worse problem than a lapsed one).
- **Hire carries forward:** `hireApplicant` copies each *verified* applicant clearance (with `expiresOn`) into `person_credentials`.

### Readiness = missing **and** expiring, against a *credential* required-set
- Readiness is computed against the **required credential set**, derived from the guard's **armed/unarmed profile** (recorded on the employee — [0017](0017-person-centric-identity.md) — so it works for the ~10k bulk-imported legacy guards who have no applicant row). Armed posts require LTOPF; unarmed do not.
- **This is a credential set, NOT the applicant document checklist.** `requiredDocsFor` includes `resume_biodata`, which is *not* a credential — using the document checklist would flag every guard as permanently "missing résumé." The readiness set is licences/clearances only.
- The employee **"Licences & clearances"** panel and the roll-up **readiness radar** surface **both** a *missing required* credential and an *expiring/expired/revoked* one.

### Operational gate (future) + the LTOPF caveat
- A missing/expired *required* credential is what should **block an armed deployment** (unlike a missing identity ID, which is only a nudge — [0017](0017-person-centric-identity.md)). Data + readiness now; the deployment gate wires up with Deployment.
- **LTOPF is licence-per-firearm/per-agency, not per-guard-forever.** A guard reassigned to a different firearm/detachment can need re-licensing. This slice models LTOPF as a Person credential with `issuingBody`/`notes`; the firearm linkage is **deferred** to Deployment/inventory. **The radar therefore reports a present LTOPF as "valid — firearm linkage unverified," never a clean all-clear**, so it can't give a false green on the reassignment case.

Because credentials hang off the Person, they survive rehire and are reusable for the next client with zero rework.

## Consequences
- `recruitment_applicant_documents` stays as the intake checklist; on hire it **feeds** `person_credentials`. Applicant documents = "what we collected to hire them"; person credentials = "the guard's living licence wallet."
- Document **file** uploads (scanned PDFs) stay **deferred** ([3-recruitment-ats §7](../slices/3-recruitment-ats.md)) — status + expiry, not blobs.
- Per-credential renewal cadences differ (SOSIA vs NBI vs LTOPF); the radar window is per-credential-aware rather than one-size.

## Cross-references
- [0017](0017-person-centric-identity.md) — person-centric identity.
- Slice design + 3b plan: [3-identity-and-credentials](../slices/3-identity-and-credentials.md), [3b plan](../slices/3b-credentials-and-readiness-plan.md).
