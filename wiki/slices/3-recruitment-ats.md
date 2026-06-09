# Slice 3 — Recruitment ATS (the HRIS front door)

> **Status:** DESIGN — awaiting Noel's review (do not implement until approved).
> **Author:** Claude (drafted 2026-06-09, autonomously per Noel's "use the transcript + flowchart, do what you need to do").
> **Scope cut chosen by Noel:** Recruitment ATS only (hiring pipeline + applicant database + blacklist flag + hire→employee). Marketing/Deployment/approvals deferred.
> **Binding decisions this slice implements:** [ADR 0009](../decisions/0009-hr-starter-and-recruitment-as-entry-point.md) (Recruitment = entry point, HR = foundation), [ADR 0004](../decisions/0004-applicant-pool-legal-classification.md) (applicant ≠ employee, unpaid pool), [ADR 0001](../decisions/0001-recruitment-vs-operations-ownership.md) (Recruitment owns assignments).
> **Grounded in:** meeting notes §1E, conversation-log §5b/§7/§8, questionnaire Part D, raw transcript IMG_6844.

---

## 0. Plain-language summary (for Noel)

Right now, employees just *appear* in Sentinel (we seeded/imported them). There's no front door. In real life at Commander Group, **nobody enters the HRIS except through Recruitment** — that was the #1 missing piece the client flagged.

This slice builds that front door: a recruiter logs an **applicant**, moves them along a pipeline (**Applied → Contacted → Documents complete → Hired**), ticks off their guard clearances (NBI, drug test, SOSIA license, etc.), and when they hit **Hire**, the applicant becomes a real employee in the `/employees` list we already built. Past applicants are kept forever (searchable). And if someone we **terminated or blacklisted** tries to re-apply, the recruiter gets a big red warning before hiring them.

What we are **not** building this slice: the Marketing "we need 100 guards" request chain, the Deployment/reshuffle engine, approval sign-offs, training records, and file uploads of the actual clearance PDFs. Those are later slices. This slice is deliberately the one self-contained, demo-able piece.

The one thing only a **lawyer** can finalize (flagged below): the exact legal instant an applicant becomes an employee. We've designed it so that decision lives in a single line of code and can be moved later without rework.

---

## 1. Goal & done-test

**Goal:** A recruiter can take a person from "walked in with a resume" to "is now employee CG-XXXXX in the HRIS," with every past applicant retained and problem guards flagged on re-apply.

**Done-test (demo script):**
1. Recruiter opens **Recruitment → Applicants**, clicks **New applicant**, fills name/contact/source/position → applicant appears in the **Applied** column.
2. Recruiter advances them to **Contacted**, then opens their profile and ticks clearance documents (NBI ✓, drug test ✓, …) until **Documents complete**.
3. Recruiter clicks **Hire** → a short form (employee code pre-filled, base salary, hire date) → confirm.
4. The applicant's pipeline card moves to **Hired**; a new employee exists at `/employees/[id]` (status `hired`); the applicant record now links to that employee.
5. Recruiter logs a *second* applicant whose name+birthdate matches a terminated guard → a **red "possible terminated/blacklisted match"** banner shows on the card and profile, and again on the Hire form.
6. Recruiter searches the full applicant database (including rejected/withdrawn) and finds anyone ever logged.

If all six work end-to-end in the browser, Slice 3 is done.

---

## 2. The central architecture decision (per ADR 0009 + 0004)

**Applicants are NOT employees.** They live in a new `modules/recruitment` table, with **no** `hr_employees` row, **no** employee code, **no** payroll record, until they are hired. This is the explicit v1-architecture correction (conversation-log §5b, ADR 0004): "Many guards are NOT paid until deployed… they are applicants, not employees — they live in Recruitment, not HR."

The handoff (ADR 0009, verbatim contract):

```
recruitment.hireApplicant(applicantId, hireMeta)
    ↓
hr.createEmployee(fromApplicant)  → returns employeeId   (status: 'hired')
    ↓
recruitment writes employeeId back onto the applicant record
    ↓
applicant.pipelineStage = 'hired'  (terminal; exits the active board)
    ↓
emits recruitment.applicant.hired   (future: Deployment/Billing subscribe)
```

> ⚠ **Payroll interaction — REQUIRED dependency of this slice (corrected 2026-06-09 after code review).** An earlier draft claimed a hired-but-undeployed employee "generates zero payslips." **That is false.** `payroll.runPayroll` loads every employee whose status is not `applicant`/`terminated` ([service.ts:33,84](../../modules/payroll/service.ts#L33)) and inserts a payslip for each **with no zero-attendance skip** ([service.ts:89-159](../../modules/payroll/service.ts#L89)). For 0 worked days, `grossPay = 0` but statutory deductions are computed off **monthly salary, not days** ([compute.ts:62-69](../../modules/payroll/compute.ts#L62)) — so a hired-undeployed guard gets a payslip showing **phantom SSS/PhilHealth/Pag-IBIG**, which would then leak into the SSS R-3 and BIR government exports.
>
> **Therefore this slice MUST include a small payroll guard:** skip any employee with zero worked days (no DTR) in the period — `if (daysWorked === 0 && otHours === 0) continue;` before the payslip insert. This is independently correct ("no attendance → no payslip"), it fixes a latent bug, and it is what makes hire-creates-employee genuinely safe: a hired-undeployed guard never produces a payslip or a government-export line until they actually work. **Must re-run the existing payroll tests** to confirm no current test relies on a 0-day employee producing a 0 payslip.

**The cleared-but-waiting "callback pool"** = applicants sitting at the **Documents complete** stage who haven't been hired yet. They have no HR record (truly not employees, truly unpaid), which keeps them safely outside payroll. This is where ADR 0004's "unpaid applicant pool" population lives.

⚠ **OPEN — a genuine ADR conflict + needs labor-lawyer sign-off (ADR 0004 vs 0009, questionnaire D9).** The two ADRs disagree on the moment of employment: **ADR 0009** says `hireApplicant → createEmployee` (employee created at hire); **ADR 0004**'s later refinement says employment *and* first pay happen at **deployment**, with cleared applicants staying in Recruitment unpaid until posted. **This slice's default:** hire-decision creates the employee record (ADR 0009), made safe by the payroll guard above (created ≠ paid; pay still follows attendance). This is demo-able and isolates the boundary to the single `hireApplicant → createEmployee` call — if the lawyer/client says "no employee until deployed" (ADR 0004-strict), we move that call into the assign flow with no schema rework. The audit log records the exact hire moment (and later the deploy moment) either way — the DOLE-inquiry defense artifact ADR 0004 calls for.

---

## 3. The pipeline (stages)

Client's explicit ATS tabs (meeting §1E): **Applied → Called/Contacted → Documents Complied → Hired**. Plus two terminal off-ramps every agency needs.

| Stage | Meaning | Next allowed |
|---|---|---|
| `applied` | Application received, not yet contacted | `contacted`, `rejected`, `withdrawn` |
| `contacted` | Recruiter reached out; screening/interview underway | `documents`, `rejected`, `withdrawn` |
| `documents` | All required clearances on file → **cleared / callback pool** (unpaid, waiting) | `hired`, `rejected`, `withdrawn` |
| `hired` | Hire decision made → `hr.createEmployee` fired → exits to `/employees` | *(terminal)* |
| `rejected` | Agency declined (reason captured) | *(terminal)* |
| `withdrawn` | Applicant dropped out / left for another agency (reason captured) | *(terminal)* |

Stage transitions are enforced by an `ALLOWED_TRANSITIONS` matrix in `modules/recruitment/labels.ts` — mirroring the proven `modules/hr/labels.ts` pattern. Each change writes an audit row + emits `recruitment.applicant.stage_changed`, so the applicant profile can render a timeline from the audit log (no separate history table — same approach HR uses).

> Note the mapping to ADR 0004: `documents` = "cleared applicant on callback list." `hired` = "activated → becomes employee." The pay boundary discussion in §2 sits exactly on the `documents → hired` edge.

---

## 4. Data model (`modules/recruitment/schema.ts`)

All UUID PKs (`defaultRandom()`), `createdAt`/`updatedAt` timestamps, matching every other module. New migration `drizzle/migrations/00NN_slice3_recruitment.sql` via `pnpm db:generate`.

### 4a. `recruitment_applicants`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `firstName`, `lastName` | text not null | |
| `middleName` | text | |
| `dateOfBirth` | date | used for blacklist/terminated matching |
| `sssNumber` | text | **stable ID for reliable blacklist/rehire matching** (collected at hire anyway). Nullable at `applied` (walk-ins may not have it yet), strongly encouraged before `documents`. See §5. |
| `phone`, `email` | text | email nullable, not unique (an applicant may re-apply) |
| `addressLine1/2`, `city`, `province` | text | feeds `hr.createEmployee` on hire |
| `source` | enum `recruitment_source` | walk_in / referral / agency / job_board / social_media / provincial / training_school / other (questionnaire D1) |
| `positionAppliedFor` | enum (reuse hr `employmentType`) | default GUARD |
| `isArmedPost` | boolean default false | drives whether LTOPF license is a required doc |
| `pipelineStage` | enum `recruitment_stage` | see §3, default `applied` |
| `appliedOn` | date not null | |
| `hiredEmployeeId` | uuid → `hr_employees.id` nullable | set on hire (the back-link from ADR 0009) |
| `outcomeReason` | text | reject/withdraw reason |
| `notes` | text | free-form recruiter notes |

### 4b. `recruitment_applicant_documents` (the clearance checklist)
One row per required document per applicant. Document set from questionnaire D2.5 / D5.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `applicantId` | uuid → applicants.id not null | |
| `docType` | enum `recruitment_doc_type` | nbi_clearance, police_pnp_clearance, barangay_clearance, drug_test, medical_exam, neuro_psych, training_cert_sbr_rtc, sosia_license, ltopf_license, resume_biodata, other |
| `status` | enum `recruitment_doc_status` | pending / submitted / verified / expired (default pending) |
| `expiresOn` | date | clearances expire (NBI ~1yr); powers an "expiring soon" warning |
| `verifiedByUserId` | uuid → users.id | |
| `verifiedOn` | date | |
| `notes` | text | |

> **v1 deliberately tracks document *status*, not the file itself.** No PDF upload/storage in this slice (the app has no blob storage configured yet). "NBI clearance: ✓ verified, expires 2027-06-01" — yes; attaching the scanned NBI PDF — fast-follow once we pick a storage backend. Flagged in §7.

> "Documents complete" = every **required** doc for this applicant is `verified`. Required set = the standard PH security set, with `ltopf_license` required only when `isArmedPost = true`. The required-set definition lives in `labels.ts` so it's one edit when the client confirms D5.

### 4c. `recruitment_blacklist`
Explicit, recruiter-curated do-not-hire list (separate from terminated employees, which are matched live from `hr_employees`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `firstName`, `lastName` | text not null | matching |
| `dateOfBirth` | date | matching |
| `reason` | text not null | why blacklisted |
| `sourceEmployeeId` | uuid → hr_employees.id nullable | if blacklisting flowed from a termination |
| `addedByUserId` | uuid → users.id | |
| `active` | boolean default true | un-blacklist without deleting history |

---

## 5. Blacklist / terminated auto-flag (meeting §1E: "prevents re-hiring without visibility")

On **applicant create** and on **the Hire form**, run `recruitment.checkMatches({firstName, lastName, dateOfBirth, sssNumber})` which returns matches from **two** sources:
1. **Terminated employees** — `hr_employees` where `status = 'terminated'`.
2. **Active blacklist entries** — `recruitment_blacklist` where `active = true`.

**Match priority:** exact `sssNumber` match first (high-confidence, when present), then `lastName` + `dateOfBirth` (medium-confidence fallback). The UI labels the confidence ("exact SSS match" vs "possible name match") so the recruiter knows whether it's a hard hit or a prompt to check. This is why §4a captures `sssNumber` — without a stable ID, name+DOB alone produces false positives (two Juan Dela Cruzes born the same day), which would erode trust in the blacklist feature the client explicitly asked for. *(Note: `hr_employees` has an `sssNumber` column already, so terminated-employee matching by SSS works today.)*

The result drives a **visibility flag, not a hard block** (matches the meeting: *"prevents re-hiring without visibility"* — surface it, let the recruiter decide). UI:
- Applicant card: small red `⚠` chip.
- Applicant profile: a red banner — *"Possible match: JUAN DELA CRUZ was terminated 2025-11-02 (CG-10042, reason: AWOL). Review before proceeding."*
- Hire form: the same banner repeated, so it can't be missed at the decision point.

⚠ **Data-quality flag (§7):** matching is name + birthdate because there is **no stable national identifier** on employees/applicants today. Two different Juan Dela Cruzes born the same day would both flag. Recommend capturing a stable ID (SSS/UMID number) to make this reliable — small schema add, big accuracy win. Until then, the flag is a prompt to check, not proof.

---

## 6. Module & UI shape

### 6a. `modules/recruitment/` (follows the standard module contract)
- `index.ts` — public surface: `recruitment.createApplicant`, `listApplicants`, `listApplicantsPage`, `getApplicant`, `advanceStage`, `setDocument`, `hireApplicant`, `rejectApplicant`, `withdrawApplicant`, `checkMatches`, `addToBlacklist`, `listBlacklist`, `removeFromBlacklist`.
- `service.ts` — logic; every mutation does `audit.record(...)` + `events.publish('recruitment.*', …)` (the established pattern from hr/assignments).
- `schema.ts`, `labels.ts` (stage + doc labels, `ALLOWED_TRANSITIONS`, `REQUIRED_DOCS`), `README.md`, `recruitment.test.ts`.
- **Depends on:** `@/core/db`, `@/modules/hr` (`createEmployee`, new `generateNextEmployeeCode`), `@/modules/audit`, `@/modules/events`.
- **Emits:** `recruitment.applicant.created`, `recruitment.applicant.stage_changed`, `recruitment.applicant.hired`, `recruitment.applicant.rejected`, `recruitment.blacklist.added`.

### 6b. Small addition to `modules/hr`
- `hr.generateNextEmployeeCode(prefix = 'CG-')` — finds the max numeric suffix among existing `employeeCode`s and returns the next (e.g., `CG-10101`). Today the code is hand-typed in the New-Employee form; the recruiter shouldn't have to. Recruiter can still override in the Hire form. *(This is the only change to an existing module.)*

### 6c. Screens (`app/(admin)/recruitment/`), all via `PageShell`
- **Applicants — list view (v1 default):** searchable, **paginated** (reuse `Pagination` + page-size selector from Slice 2) across **all** applicants incl. rejected/withdrawn — this is the "database of all past applicants retained" (meeting §1E). Columns: name, position, **stage** (as a chip), days-in-stage, doc progress (`4/9`), `⚠` match flag. Filter by stage/source. A "stage" column + per-row "advance" beats a kanban for the first cut: it scales to 10k rows, needs no drag-drop library, and ships faster.
- **Applicants — board (kanban) view:** *deferred to a fast-follow* (see §7). Nice for eyeballing a small live pipeline, but it doesn't scale to thousands and adds drag-drop complexity — not worth blocking the slice on.
- **Applicant detail**: profile + editable document checklist + stage timeline (from audit) + actions (Advance, Hire, Reject, Withdraw) + match banner.
- **Hire form** (modal via `ModalShell`): employee code (pre-filled from `generateNextEmployeeCode`, editable), base salary, hire date, employment type → `hireApplicant`. On success: link to the new `/employees/[id]` and an **"Assign to a detachment now →"** shortcut into the *existing* Slice-2 assign flow.
- **Blacklist**: paginated list + "Add to blacklist" form.
- **Nav:** new "Recruitment" sidebar group (Applicants, Blacklist), placed above Operations since it's now the entry point.

### 6d. ASCII mockups

**Applicants list (v1 default):**
```
 Recruitment · Applicants                                        [ + New applicant ]
 Search [ dela________ ]   Stage [ All ▾ ]   Source [ All ▾ ]
 ───────────────────────────────────────────────────────────────────────────────
  NAME              POSITION   STAGE         IN STAGE   DOCS   FLAG
  Dela Cruz, Juan   Guard      ● Applied      2d        0/9    ⚠ name match
  Santos, Maria     Guard      ● Contacted    5d        2/9
  Reyes, Ana        Guard      ● Documents    11d       9/9    ⚠ SSS match
  Tan, Rico         Driver     ● Applied      1d        0/6
  Cruz, Pedro       Guard      ✓ Hired        —         → CG-10101
  Lim, Carla        Guard      ✗ Rejected     —                (failed neuro-psych)
 ───────────────────────────────────────────────────────────────────────────────
  Showing 1–50 of 312 · page 1 of 7        Rows: [50 ▾]      ◀ Prev   Next ▶
 Footer: Click a row to open, tick documents, and advance the stage. Hire moves them into Employees.
```

**Applicant detail (top):**
```
 ◀ Applicants                                            Stage: ● Documents complete
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ ⚠  POSSIBLE MATCH — Reyes, Ana (b. 1994-03-12) matches terminated guard       │
 │     CG-10042, terminated 2025-11-02, reason: AWOL.  Review before hiring.      │
 └─────────────────────────────────────────────────────────────────────────────┘
  Ana Reyes        Guard (unarmed)    Source: Referral    Applied: 2026-05-29
  0917-555-0140    ana@example.com    Quezon City

  Clearance documents                                        [ Advance ] [ Hire ▸ ]
  ☑ NBI clearance        verified  exp 2027-05-01            [ Reject ] [ Withdraw ]
  ☑ Drug test            verified
  ☑ Barangay clearance   verified
  ☐ Neuro-psych          pending
  ☐ SOSIA license        submitted
  …                                                          (4 / 9 verified)
```

---

## 7. Out of scope (explicit — deferred to later slices)

| Deferred | Why / where it lands |
|---|---|
| **Kanban board view** of the pipeline | Fast-follow after v1 list ships; doesn't scale to 10k, adds drag-drop complexity |
| Marketing "need N guards" request + demand chain | Slice 4+ (Marketing/Contracts module); ADR 0009 Phase order |
| Deployment / reshuffle **ownership** rebuild | Assignments already exist (Slice 2). ADR 0001 gives Recruitment ownership, but that's an **RBAC** concern — and there's no RBAC engine yet (every login = admin). On hire, recruiter uses the existing assign flow. Enforcement lands when RBAC ships. |
| Approval sign-offs (hiring requisition) | `modules/approvals` exists but stays unused here (YAGNI); Slice 4+ |
| Training records (SBR/RTC, refreshers) | Questionnaire D4 — later |
| **Document file uploads** (scanned PDFs) | Needs a blob-storage decision; v1 tracks status only |
| RBAC "Recruiter" role enforcement | No RBAC engine yet; flagged for the foundation slice |
| Auto pool-timeout / clearance-expiry alerts | Show "days in pool" + "expiring soon" read-only; automated removal later (D11) |
| Stable national ID for reliable matching | Recommended schema add; flagged §5 |

---

## 8. Open questions (for Noel / client / lawyer)

1. **[LAWYER — highest stakes]** ADR 0004: the exact applicant→employee legal moment + legality of the unpaid cleared pool. *Design default:* employee created at Hire (payroll-safe per §2), isolated to one call so it's movable.
2. **[CLIENT D2/D5]** Confirm the screening stages and the exact required-document set (armed vs unarmed). *Design uses* the standard PH security set from questionnaire D2.5.
3. **[CLIENT D9]** Does hiring require a signed-contract artifact on file before the employee is created? (Not modeled in v1.)
4. **[CLIENT D13]** How deeply do you track rehires (people who left for another agency and came back)? *Design* flags matches; full rehire history needs the stable ID from §5.
5. **[NOEL]** Employee-code scheme — confirm `CG-#####` auto-increment is correct (next would be `CG-10101`).
6. **[NOEL]** Board view vs list view as the default landing; sidebar placement of the Recruitment group.

None of these block building the slice — they're confirmations that may tweak labels/required-doc sets, not the architecture.

---

## 9. Test plan (TDD — `modules/recruitment/recruitment.test.ts`)

Integration tests against the real DB (hits `sentinel_test` via `TEST_DATABASE_URL`; `beforeEach` deletes in FK order: documents → applicants → blacklist, and any employees created by hire tests). Cases:
- create applicant → defaults to `applied`, emits `recruitment.applicant.created`.
- stage transitions follow `ALLOWED_TRANSITIONS`; illegal transition throws plain-language error.
- `setDocument` toggles status; "documents complete" computed correctly incl. the armed/LTOPF rule.
- `hireApplicant` → creates an `hr_employees` row (status `hired`, auto code), back-links `hiredEmployeeId`, sets stage `hired`, emits `recruitment.applicant.hired`; **no payslip is produced** (asserts payroll-safety).
- `checkMatches` flags a terminated employee and an active blacklist entry by name+DOB; returns empty for a clean applicant.
- reject/withdraw capture reason, are terminal.

Plus a Playwright browser-walk of the §1 demo script before handing to Noel (per the standing "browser-verify before pushing" rule).

---

## 10. Build order (for the implementation plan, once approved)

1. **Payroll guard first (de-risk the integration):** add the zero-attendance skip to `payroll.runPayroll` + a regression test (`hired` employee with no DTR → no payslip); re-run the existing payroll suite. Do this before recruitment can create employees, so the unsafe path never exists.
2. `modules/recruitment` schema + migration + `labels.ts`.
3. `hr.generateNextEmployeeCode` + tests.
4. `recruitment` service + tests (createApplicant, advanceStage, setDocument, checkMatches incl. SSS-priority, reject/withdraw) — TDD.
5. `recruitment.hireApplicant` handoff + tests (the ADR 0009 contract; assert no payslip for the new hire) — TDD.
6. Blacklist service + tests.
7. UI: Applicants **list** (paginated, the v1 default) → detail → Hire modal → Blacklist screen; nav entry. *(Kanban board is a fast-follow, not in this slice.)*
8. Playwright walk of the demo script; README; done-sweep; UX-walk with Noel.

— end of design —
