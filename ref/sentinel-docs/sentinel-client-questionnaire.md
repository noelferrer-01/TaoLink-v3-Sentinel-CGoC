# Sentinel HRIS — Client Discovery Questionnaire

> **Purpose:** Validate workflow assumptions and gather detailed requirements before locking the system architecture.
> **Audience:** Routed by section to the appropriate department head. Executive sponsor reviews all sections.
> **Companion documents:** `SENTINEL_HRIS_ARCHITECTURE.md` (v1), `SENTINEL_HRIS_CONVERSATION_LOG.md`.
> **Marker convention:**
> - `[CONFIRM]` — we already have a working assumption from prior conversations. Please confirm or correct.
> - `[DETAIL]` — open question, please answer in detail.
> - `[CRITICAL]` — wrong answer here means wrong data model. Please be precise.

---

## How to Use This Document

1. **Route by section.** Each section is labeled with the recommended respondent (HR Manager, Operations Manager, Marketing Head, etc.). The same person may answer multiple sections.
2. **Be specific.** "It depends" answers must be followed by "it depends on X — when X is A, we do Y; when X is B, we do Z."
3. **Examples beat abstractions.** Where possible, give a real example (anonymized if needed).
4. **Flag exceptions.** If 95% of cases follow rule X but 5% don't, document both.
5. **Don't smooth over messiness.** If the current process has gray areas or inconsistencies, say so. The system needs to model reality, not the ideal.

---

## PART A — Strategic & Project Context

**Respondent:** Executive Sponsor (CEO / COO / VP Operations)

### A1. Project objectives
1. **[DETAIL]** What is the primary business problem this HRIS is solving? (e.g., compliance risk, payroll errors, scaling pains, replacing legacy system, executive visibility, all of the above)
2. **[DETAIL]** What does success look like 12 months after deployment? Be concrete (e.g., "payroll runs in 2 hours instead of 5 days," "zero PNP audit findings," etc.)
3. **[DETAIL]** What are the top 3 pain points with the current way of doing things?
4. **[DETAIL]** Are there any specific incidents (lost firearm, payroll dispute, DOLE complaint, client lost due to fulfillment failure) that triggered this project?

### A2. Scope and timeline
5. **[DETAIL]** What is the target go-live date for the first phase? Is this date negotiable or fixed (regulatory deadline, contract obligation)?
6. **[DETAIL]** Is there budget allocated already? Approximate range?
7. **[DETAIL]** Who is the project sponsor (final decision-maker for scope/budget changes)?
8. **[DETAIL]** Who is the day-to-day project owner on the client side?
9. **[DETAIL]** Will the client provide a project manager, business analyst, or subject-matter experts dedicated to this project?

### A3. Build model
10. **[DETAIL]** Is this an internal build (Noel as contracted developer for this agency only) or will the agency want to license/resell this to other agencies later? *This affects whether multi-tenancy goes in the foundation.*
11. **[DETAIL]** Will the agency own the source code, or is this a SaaS subscription?

---

## PART B — Organizational Structure

**Respondent:** HR Director / COO

### B1. Org chart
1. **[DETAIL]** Provide the current org chart, including:
   - All departments
   - Department heads and reporting lines
   - Headcount per department (approximate)
   - Regional/branch structure (Manila HQ, regional offices)
2. **[CONFIRM]** We currently understand recruitment is centralized in Manila with possible satellite intake offices that route candidates to Manila for processing. Correct?
3. **[DETAIL]** Are there regional managers or area managers who oversee specific groups of detachments? If yes, how are detachments grouped (by region, by client type, by city)?

### B2. Key departments to map
4. **[DETAIL]** For each of these departments, provide: name of head, headcount, primary responsibilities, primary systems they currently use:
   - Marketing / Business Development / Sales
   - Recruitment
   - Deployment / Operations
   - HR / Personnel / 201 file management
   - Training
   - Payroll
   - Loans / Employee benefits
   - Inventory / Logistics / Armory
   - Compliance / Legal
   - Finance / Accounting / Billing
   - Field Supervision
   - IT / Admin
5. **[DETAIL]** Are there any departments we haven't listed that should be in the system?

### B3. Roles and access
6. **[DETAIL]** Within each department above, list the typical job titles (e.g., HR has HR Officer, HR Specialist, HR Manager).
7. **[DETAIL]** Are there roles that span departments (e.g., a Compliance Officer who needs read access to everything)?
8. **[DETAIL]** Who in the organization has executive read-only dashboard access?

---

## PART C — Marketing & Sales / Client Contracts

**Respondent:** Marketing Head / Sales Manager

### C1. Workflow confirmation
1. **[CONFIRM]** Marketing originates client demand by signing contracts and capturing requirements. Marketing fills a Request Form and submits it to Recruitment/Deployment. Marketing does NOT decide which specific guards go to which client. Is this accurate?
2. **[DETAIL]** Walk us through the full lifecycle of a new client, from first contact to first day of guard deployment. Who does what at each step?
3. **[DETAIL]** What is the typical lead time from contract signing to guard deployment?

### C2. The Request Form
4. **[CRITICAL]** What fields are on the current Marketing Request Form? Provide a sample if possible. We need to know exactly what data Marketing captures.
5. **[CRITICAL]** What are ALL the requirements a client can specify? (Examples: headcount, height/build, age range, gender preference, firearms, two-way radios, specific training/certification, language fluency, prior experience, English proficiency, K9 handlers, drivers, gender-balanced teams.) List exhaustively.
6. **[DETAIL]** Are there client requirements that are illegal or sensitive (e.g., gender or age preference) and must be handled carefully?
7. **[DETAIL]** Does Marketing capture special schedule requirements (24/7 coverage, day-only, night-only, event-based, weekends-only)?

### C3. Contract structure
8. **[DETAIL]** What is the typical contract structure? Term length? Renewal terms? Termination clauses?
9. **[DETAIL]** How is pricing structured? Per guard per month? Per shift? Bundled service fee? Different rates for armed vs. unarmed?
10. **[DETAIL]** Are billing rates typically:
    - Fixed monthly?
    - Variable based on actual hours worked?
    - With OT and holiday premiums billed separately?
11. **[DETAIL]** Mid-contract changes: if a client wants to add or reduce posts mid-contract, how is that handled? Amendment? New SOW?
12. **[DETAIL]** Do you handle bid/tender processes (e.g., government contracts via PhilGEPS)? If yes, how does this differ from direct contracts?

### C4. SLA and fulfillment
13. **[CONFIRM]** Agency tracks fulfillment SLA / client satisfaction. Confirmed?
14. **[CRITICAL]** Define "fulfilled" precisely. Is the SLA met when:
    - All guards are deployed by deadline?
    - All guards are deployed AND meet all stated requirements?
    - 90% fill rate is acceptable, 100% required, or other?
15. **[DETAIL]** What's the financial/contractual penalty for missing SLA?
16. **[DETAIL]** How is client satisfaction measured? (Periodic survey? Direct client feedback? NPS? Renewal rate?)
17. **[DETAIL]** Who handles client complaints? How are they logged today?

### C5. Approval gates in marketing
18. **[CONFIRM]** Approval gates exist between Marketing → Deployment. Confirmed?
19. **[DETAIL]** What contracts require executive approval vs. department-level approval? Specific peso threshold?
20. **[DETAIL]** Are there contract types that require legal review before signing (e.g., government, multinational)?

---

## PART D — Recruitment & Applicant Pool

**Respondent:** Recruitment Manager

### D1. Sourcing
1. **[DETAIL]** Where do you source guards from? (Walk-in applicants, referrals, recruitment agencies, online job boards, social media, provincial sourcing, industry training schools.)
2. **[DETAIL]** Approximate volume: how many applicants do you process monthly? How many do you hire monthly?
3. **[DETAIL]** Do you have provincial recruitment partners or satellite intake offices? How do they coordinate with Manila?

### D2. Screening pipeline
4. **[CRITICAL]** Walk us through every stage from "applicant submits resume" to "applicant is callback-ready." List all stages and what happens at each:
   - Initial application
   - Document verification (NBI, police, barangay clearance, drug test, medical, neuro-psych)
   - Interview (HR? Operations?)
   - Background check
   - Training (basic security training, SBR/RTC course)
   - Final endorsement
5. **[DETAIL]** What documents must be on file before someone is "cleared"? (NBI, PNP clearance, brgy clearance, medical, neuro-psych, drug test, police clearance, training certificate, SOSIA license, LTOPF license if armed.)
6. **[DETAIL]** What are the typical timelines for each clearance? (NBI takes ~3 days, neuro-psych takes ~1 week, etc.)
7. **[DETAIL]** What's the rejection rate at each stage? Are there common disqualifiers?

### D3. Applicant pool — CRITICAL CLARIFICATION
8. **[CRITICAL/CONFIRM]** We currently understand:
   - "Applicant pool" = people who have been screened and cleared but are NOT yet hired/employed.
   - These applicants are NOT paid while waiting for deployment.
   - Some leave for other agencies if the wait is too long.
   - Only when deployed do they become employees and enter payroll.
   **Is this correct? If not, please explain the actual practice in detail.**
9. **[CRITICAL]** At exactly what moment does an applicant become a legal employee?
   - When they sign the employment contract?
   - When they start training?
   - When they receive their first deployment order?
   - When they first clock in at a detachment?
10. **[CRITICAL]** Is the training period paid? If yes, who pays — agency or client?
11. **[DETAIL]** How long can a cleared applicant stay in the pool before being "removed"? Is there an automatic timeout or manual review?
12. **[DETAIL]** When you remove an applicant from the pool (left for another agency, lost interest, expired clearances), how is that recorded?
13. **[DETAIL]** Do you track applicants who returned after leaving for other agencies (rehires)?

### D4. Training
14. **[DETAIL]** What training is required pre-employment?
   - Basic security training course (SBR / RTC)
   - In-house orientation
   - Client-specific training (e.g., mall protocols, hospital, BPO)
15. **[DETAIL]** Who provides training? Internal training department, accredited external schools, or both?
16. **[DETAIL]** What ongoing training is required (annual refreshers, firearms requalification, CPR/first aid)?
17. **[DETAIL]** How are training records currently kept?

### D5. Hiring requisition
18. **[DETAIL]** When Recruitment receives a Marketing request and decides to hire (vs. activate from pool), what's the process? Who approves opening a hiring requisition?
19. **[DETAIL]** Are there standing job orders (continuously open positions for guard role) vs. one-off requisitions?

---

## PART E — Deployment & Manpower Pool

**Respondent:** Operations Manager / Deployment Head

### E1. Workflow confirmation
1. **[CONFIRM]** Deployment fulfills demand using two paths: (a) reassign existing employees (relievers, floaters, end-of-contract guards), and (b) call up cleared applicants from the pool. If both are insufficient, request new hires from Recruitment. Confirmed?
2. **[CONFIRM]** "Reshuffle" = pulling guards from one detachment and reassigning to another. Done by Operations/Deployment. Confirmed?

### E2. Detailed deployment process
3. **[CRITICAL]** Walk through the deployment of a single guard, end to end:
   - Guard is identified for deployment
   - Deployment order is generated (what's on it?)
   - Guard is briefed/oriented for the specific client
   - Guard receives equipment (uniform, firearm, radio)
   - Guard reports to detachment on day 1
   - Guard checks in with site supervisor
4. **[DETAIL]** What is a "deployment order" or assignment letter? What information is on it? Who signs it?
5. **[DETAIL]** How are clients notified that specific guards are being deployed to them? Do they get names in advance?
6. **[DETAIL]** Are there client approval rights? (E.g., client can reject a guard before deployment, or after seeing performance?)

### E3. Manpower pool / employee statuses
7. **[CRITICAL]** List ALL the possible statuses a guard can be in. Examples to confirm or correct:
   - **Deployed** — currently posted at a client
   - **Reliever** — covering shifts at multiple posts
   - **Floater** — between assignments, paid by agency
   - **Bench** — paid but unposted (does this exist as a paid status?)
   - **On training** — in pre-employment or refresher training
   - **On leave** — VL, SL, maternity, paternity
   - **Suspended** — disciplinary
   - **AWOL** — absent without leave (definition?)
   - **Terminated** — cleared out
   - **Resigned** — voluntary exit
   - **Pending clearance** — exiting, completing clearance
8. **[CRITICAL]** Of the above, WHICH statuses are paid by the agency?
9. **[DETAIL]** Reliever vs. floater vs. bench — does your agency distinguish these? What terminology do you use?
10. **[DETAIL]** When a guard's client contract ends (client terminated services, contract not renewed):
    - Where does the guard go? Reliever pool? Bench? Returned to applicant pool?
    - Are they still paid while waiting?
    - How long before they're terminated if no new assignment?

### E4. Reshuffling
11. **[DETAIL]** What triggers a reshuffle? (Client demand spike, disciplinary, performance, contract end, client request, equipment availability.)
12. **[DETAIL]** Who decides a reshuffle? What approval is required, especially for large reshuffles?
13. **[DETAIL]** How are guards notified of reshuffles? How much notice is required?
14. **[DETAIL]** Are there guards who are "permanent" at a detachment (cannot be reshuffled) vs. rotational?
15. **[DETAIL]** What's done with the guard's existing equipment when reshuffled? (Returned to armory? Transferred to new post?)

### E5. Special deployments
16. **[DETAIL]** Do you handle ad-hoc / event-based deployments? (VIP escort, special events, election security.) How is this different from regular deployments?
17. **[DETAIL]** Subcontracting: do you ever subcontract guards from other agencies, or do other agencies subcontract from you?

---

## PART F — HR / Employee Lifecycle

**Respondent:** HR Manager

### F1. Employee record (201 file)
1. **[DETAIL]** What is in the current 201 file? Provide the complete list of documents/data points. Examples: personal info, IDs (TIN, SSS, PhilHealth, Pag-IBIG), contracts, clearances, training certificates, licenses (SOSIA, LTOPF), photo, fingerprints, biometric data, dependents, beneficiaries, performance evaluations, disciplinary actions.
2. **[DETAIL]** Are 201 files currently digital, paper, or both? Where are they stored?
3. **[DETAIL]** Who has access to 201 files today?

### F2. Lifecycle events
4. **[CRITICAL]** List every lifecycle event for an employee and what should happen in the system:
   - Hired
   - Trained
   - Deployed (first time)
   - Reshuffled / reassigned
   - Promoted (e.g., guard → SIC → detachment commander)
   - Demoted
   - On leave (each type — VL, SL, maternity, paternity, solo parent, bereavement, calamity)
   - Returned from leave
   - Suspended
   - AWOL
   - Resigned (with notice)
   - Resigned (immediate / abandoned)
   - Terminated for cause
   - Retired
   - Re-hired
5. **[CRITICAL]** For each, who initiates? Who approves? What documents are generated?

### F3. Benefits and entitlements
6. **[DETAIL]** What benefits do guards receive beyond the legally mandated (SSS, PhilHealth, Pag-IBIG)? HMO? Group insurance? Loyalty bonuses? Rice subsidy? Meal allowance? Transportation?
7. **[DETAIL]** Are benefits the same for all guards or do they vary by client / contract / tenure?
8. **[DETAIL]** Leave entitlements: how many VL, SL, and other leaves per year? Are they different for different roles?
9. **[DETAIL]** Service Incentive Leave (5 days under Labor Code) — how is it currently administered?

### F4. Performance and discipline
10. **[DETAIL]** How are performance evaluations conducted? Frequency? Who evaluates?
11. **[DETAIL]** What disciplinary actions are possible? (Verbal warning, written warning, suspension, dismissal.)
12. **[DETAIL]** Is there a due process workflow (notice to explain, hearing, decision)?
13. **[DETAIL]** Are sanctions tracked in the 201 file?

### F5. Termination and clearance
14. **[CRITICAL]** Walk through the full clearance process when an employee leaves:
    - Notice/exit interview
    - Asset return (firearm, radio, uniform, ID, vehicle)
    - Clearance from each department (HR, Operations, Finance, Inventory)
    - Final pay computation (last salary, prorated 13th month, unused leaves, separation pay if applicable)
    - Issuance of Certificate of Employment, BIR 2316, SSS/PhilHealth/Pag-IBIG records
15. **[DETAIL]** Is there a blacklist for terminated/AWOL employees? How long is the cooling-off period for rehires?

---

## PART G — DTR / Attendance

**Respondent:** Operations Manager / Payroll Manager

### G1. Shift patterns
1. **[CRITICAL]** List every shift pattern your agency uses. Examples to confirm or expand:
   - 12-hour shifts (e.g., 6am-6pm, 6pm-6am)
   - 8-hour shifts (8am-4pm, 4pm-12mn, 12mn-8am)
   - 24-hour posts
   - Roving / mobile patrol
   - Day-only / night-only
   - Weekend-only
   - Event-based (variable)
2. **[DETAIL]** For each pattern, what are the start/end times, break rules, and OT thresholds?
3. **[DETAIL]** Do shift patterns vary by client? (We assume yes per the architecture doc — please confirm.)
4. **[DETAIL]** Are shift schedules fixed or do they rotate (e.g., guards rotate between day/night every week)?

### G2. Attendance capture
5. **[DETAIL]** How is attendance captured today? (Biometric devices, manual logbook, mobile app, supervisor sign-off, phone-based, RFID.)
6. **[DETAIL]** If biometric: what brands/models? Where are they installed (HQ, every detachment, only some)?
7. **[DETAIL]** What's done when biometric fails (device down, fingerprint not recognized, power outage)?
8. **[DETAIL]** Roving / mobile guards — how is their attendance tracked?
9. **[DETAIL]** Detachment supervisors — same DTR rules as guards or different?

### G3. DTR rules
10. **[CRITICAL]** Define "late" for your agency. Grace period in minutes?
11. **[CRITICAL]** Define "AWOL." How many consecutive missed shifts triggers AWOL status? What's the disciplinary process?
12. **[DETAIL]** Define "undertime" handling. Is salary deducted? On what basis?
13. **[DETAIL]** Overtime rules — pre-approved only or any time worked beyond shift counts?
14. **[DETAIL]** Night differential — what hours qualify? What rate (typically 10% per Labor Code)?
15. **[DETAIL]** Holiday work — regular holiday vs. special non-working vs. special working day. What rates?
16. **[DETAIL]** Rest day work — additional premium?
17. **[DETAIL]** Double-holiday work — does this happen? (E.g., when a regular holiday falls on rest day.)

### G4. DTR approval and corrections
18. **[DETAIL]** Who approves DTR? Detachment supervisor? Operations? HR?
19. **[DETAIL]** What's the cut-off date for DTR approval before payroll?
20. **[DETAIL]** How are DTR corrections handled (e.g., guard forgot to clock out, supervisor manually adjusts)? Audit trail?

---

## PART H — Payroll & Disbursement

**Respondent:** Payroll Manager / Finance Director

### H1. Pay cycle
1. **[CRITICAL]** What is the payroll frequency? Bi-monthly (15th and 30th)? Monthly? Weekly?
2. **[DETAIL]** Are different employee categories paid differently? (E.g., office staff monthly, guards bi-monthly.)
3. **[DETAIL]** Cut-off dates relative to pay-out dates?
4. **[DETAIL]** Pay-out method: cash, ATM/payroll account, check, mix? Per employee preference or standardized?

### H2. Payroll computation
5. **[CRITICAL]** Walk us through how a typical guard's payslip is computed. List ALL components:
   - Basic salary (daily rate × days worked? Monthly fixed?)
   - Overtime
   - Night differential
   - Holiday pay (regular, special)
   - Rest day premium
   - Allowances (meal, transportation, hazard, uniform, laundry)
   - 13th month accrual
   - Service Incentive Leave conversion
   - Retro adjustments
6. **[DETAIL]** Are wages tied to the regional minimum wage or above? Different regions = different rates?
7. **[DETAIL]** How are mid-cycle hires handled (proration)? Mid-cycle separations?
8. **[DETAIL]** How are retro adjustments handled (e.g., a DTR correction surfaces after payroll closed)?

### H3. Deductions
9. **[CRITICAL]** List ALL standard deductions:
   - SSS contribution
   - PhilHealth contribution
   - Pag-IBIG contribution
   - BIR withholding tax (TRAIN Law brackets)
   - SSS loan
   - Pag-IBIG loan / housing
   - Company / cash advance loans
   - Uniform deduction
   - Cash bond / equipment bond
   - Late / undertime deductions
   - Disciplinary deductions (if any — flag legality)
   - Cooperative dues
   - Union dues
   - Other?
10. **[DETAIL]** Are there client-specific deductions? (E.g., one client requires bond.)

### H4. 13th month and bonuses
11. **[DETAIL]** When is 13th month paid out? December? Half-and-half? Pro-rated for partial-year employees?
12. **[DETAIL]** Are there other bonuses? (Christmas bonus, mid-year, performance, loyalty.)

### H5. Special payroll scenarios
13. **[DETAIL]** Final pay for resigned/terminated employees — typical timeline (30 days)?
14. **[DETAIL]** Maternity benefits — agency advances and reimburses from SSS, or employee waits for SSS?
15. **[DETAIL]** Sickness benefits — same question as above.
16. **[DETAIL]** Solo parent leave, magna carta of women, etc. — how are special leaves handled?

### H6. Payroll output documents
17. **[DETAIL]** What documents are generated each payroll cycle? Payslips, payroll register, bank file (for ATM), cash voucher, government remittance reports, alpha list?
18. **[DETAIL]** What's the format of the payslip? Printed and distributed, emailed, viewable in portal?

---

## PART I — Loans & Cash Advance

**Respondent:** Loans Officer / HR

### I1. Loan types
1. **[DETAIL]** What loans does the agency offer employees?
   - Cash advance
   - Salary loan
   - Emergency loan
   - Calamity loan
   - Educational loan
   - Other?
2. **[DETAIL]** What are the terms for each? (Max amount, interest rate, term length, eligibility.)
3. **[DETAIL]** Are SSS loan, Pag-IBIG loan, and company loan handled in the same module or different?

### I2. Workflow
4. **[CRITICAL]** Walk us through a loan application end-to-end:
   - Employee submits request
   - Approval(s) — who and at what threshold?
   - Disbursement — cash, salary advance, bank transfer
   - Deduction setup in payroll
   - Payoff and clearance
5. **[DETAIL]** What thresholds trigger which approver? (E.g., < ₱5,000 = supervisor; ₱5,000–₱20,000 = HR Manager; > ₱20,000 = Finance Director.)
6. **[DETAIL]** Can an employee have multiple loans at once? Cap on total deduction (e.g., max 50% of net pay)?
7. **[DETAIL]** What happens to an outstanding loan when an employee resigns or is terminated? Deducted from final pay? Demand letter?

---

## PART J — Inventory (Firearms / Radios / Uniforms / Vehicles / Other)

**Respondent:** Inventory Manager / Armorer / Logistics Head

### J1. Firearms
1. **[CRITICAL]** What firearm types are in inventory? List models and quantities approximately.
2. **[CRITICAL]** Per PNP-FEO regulations, what records must the system keep for each firearm? (Serial number, license number, license expiry, assigned guard, assignment history, ammunition issued/returned, qualification status.)
3. **[DETAIL]** Are firearms individually assigned (one guard, one firearm) or shared (post-based, multiple guards rotate)?
4. **[DETAIL]** Ammunition tracking — how granular? Per round? Per box?
5. **[DETAIL]** Firearm requalification — how often? Who manages? Records kept?
6. **[DETAIL]** Lost/stolen firearm protocol — who's notified, what's reported (PNP, FEO), what's the system's role?
7. **[DETAIL]** Firearm transfers between guards — workflow? Approval?

### J2. Two-way radios
8. **[DETAIL]** Radio inventory — types, brands, frequencies. NTC permits per radio?
9. **[DETAIL]** Same individual-vs-shared question as firearms.
10. **[DETAIL]** Maintenance and replacement cycles?

### J3. Uniforms
11. **[DETAIL]** Uniform issuance — how many sets per guard initially? Replacement cycle? Different uniforms for different clients?
12. **[DETAIL]** Are uniforms deducted from salary, free, or partially shouldered?
13. **[DETAIL]** Returned at separation? What's done with returned uniforms?

### J4. Vehicles
14. **[DETAIL]** Mobile patrol or escort vehicles? How are they assigned and tracked?
15. **[DETAIL]** Driver licenses, vehicle registration, insurance, maintenance — system scope?

### J5. Other equipment
16. **[DETAIL]** Other items the system needs to track: batons, handcuffs, ballistic vests, flashlights, whistles, ID holders, badges, K9 equipment, body cams?
17. **[DETAIL]** What's the threshold for "tracked vs. not tracked"? (E.g., flashlights might be too low-value to individually serial-track.)

### J6. Per-client requirements
18. **[CRITICAL/CONFIRM]** Different clients require different equipment loadouts. Some need firearms, some don't; some need radios, some don't. The system should support per-client equipment requirement profiles. Confirmed?
19. **[DETAIL]** Provide examples of 5–10 different client equipment profiles to validate the data model.

---

## PART K — Training & Certification

**Respondent:** Training Officer / HR

### K1. Training types
1. **[DETAIL]** List all training types tracked:
   - Basic security training (SBR/RTC)
   - In-service / refresher training
   - Firearms requalification
   - Specialized (CPR/first aid, fire safety, customer service, K9, EOD)
   - Client-specific training
2. **[DETAIL]** Are trainings provided in-house, externally, or both? Track providers?
3. **[DETAIL]** Are training schedules planned or ad-hoc?

### K2. Records
4. **[DETAIL]** What's kept for each training? (Date, duration, trainer, location, participants, scores/grades, certificate, expiry.)
5. **[DETAIL]** Expiry tracking — system alerts before expiry?

---

## PART L — Performance, Discipline & Termination

**Respondent:** HR Manager / Operations Manager

### L1. Performance
1. **[DETAIL]** Performance evaluation process — frequency, evaluators, criteria, output?
2. **[DETAIL]** Promotion and demotion criteria and process?
3. **[DETAIL]** Are evaluations tied to compensation or bonuses?

### L2. Discipline
4. **[CRITICAL]** Define your disciplinary code. What infractions exist and what sanctions?
5. **[CRITICAL]** Walk through the due process workflow:
   - Notice to explain (NTE)
   - Employee response
   - Administrative hearing
   - Decision
   - Appeal (if any)
6. **[DETAIL]** Suspensions — paid or unpaid? Salary handling during suspension?

### L3. Termination
7. **[DETAIL]** Termination workflow — who initiates, who approves, what documents?
8. **[DETAIL]** Separation pay scenarios — when is it required, how computed?
9. **[DETAIL]** Final pay computation timeline — how soon after last day?

---

## PART M — Compliance & Reporting

**Respondent:** Compliance Officer / HR Manager / Legal

### M1. PNP SOSIA
1. **[CRITICAL]** What reports does PNP SOSIA require? Frequency? Format?
2. **[DETAIL]** What guard licensing is tracked? Renewal cycles?
3. **[DETAIL]** What agency licensing is tracked? Expiry dates? Renewal process?

### M2. PNP-FEO (Firearms)
4. **[CRITICAL]** What reports does FEO require? Frequency? Format?
5. **[DETAIL]** Per-firearm and per-guard licensing renewal cycles?

### M3. NTC (Radios)
6. **[DETAIL]** What permits and reports are required? Frequency?

### M4. DOLE
7. **[CRITICAL]** D.O. 150-2016 compliance — what records and reports? Frequency?
8. **[DETAIL]** Standard labor reports (DOLE establishment report, RKS Form 5, etc.)?
9. **[DETAIL]** OSH (Occupational Safety and Health) compliance?

### M5. BIR
10. **[DETAIL]** Form 2316 (annual employee tax certificate) — generation timing?
11. **[DETAIL]** Alphalist of employees — annual?
12. **[DETAIL]** Form 1601-C (monthly withholding tax remittance) — system role?

### M6. SSS / PhilHealth / Pag-IBIG
13. **[DETAIL]** Monthly remittance reporting — formats required by each agency? Online filing supported?
14. **[DETAIL]** R3 (SSS), RF1 (PhilHealth), MCRF (Pag-IBIG) — current process?

### M7. Audits
15. **[DETAIL]** How often does PNP SOSIA / DOLE / BIR audit? What do they typically ask for?
16. **[DETAIL]** What was the most recent audit finding (if any)?

---

## PART N — Approval Authority Matrix

**Respondent:** COO / HR Director / Finance Director (jointly)

For each action below, specify: **(a) who initiates, (b) who approves, (c) approval thresholds (peso amount or count), (d) escalation if denied or timed out.**

1. **[CRITICAL]** Marketing contract signing
2. **[CRITICAL]** Marketing Request Form approval (sending to Deployment)
3. **[CRITICAL]** Hiring requisition (opening new positions)
4. **[CRITICAL]** Individual hire (after screening, before contract signing)
5. **[CRITICAL]** Reshuffle of N+ guards
6. **[CRITICAL]** Salary adjustment
7. **[CRITICAL]** Promotion / demotion
8. **[CRITICAL]** Leave approval (per leave type)
9. **[CRITICAL]** Loan approval (per loan size threshold)
10. **[CRITICAL]** Cash advance
11. **[CRITICAL]** Firearm issuance
12. **[CRITICAL]** Firearm transfer
13. **[CRITICAL]** Disciplinary action (per severity)
14. **[CRITICAL]** Suspension
15. **[CRITICAL]** Termination
16. **[CRITICAL]** Final pay disbursement
17. **[CRITICAL]** Client billing adjustment / write-off
18. **[CRITICAL]** Master data changes (creating new client, new detachment)
19. **[CRITICAL]** System user creation / role assignment
20. **[CRITICAL]** Bulk operations (mass deployment, mass reshuffle, mass salary adjustment)

---

## PART O — Existing Systems & Data Migration

**Respondent:** IT Head / Department Heads

### O1. Current systems inventory
1. **[CRITICAL]** List every system currently in use, even Excel files and paper logs:
   - HR / 201 file system
   - Payroll system
   - DTR / biometric system
   - Recruitment tracker
   - Inventory / armory tracker
   - Client / contract management
   - Billing / accounting
   - Training records
   - Compliance reporting
2. **[DETAIL]** For each: vendor/tool name, age, who maintains it, what data it holds.
3. **[DETAIL]** Are any of these systems integrated with each other today? How?

### O2. Migration scope
4. **[CRITICAL]** What data needs to be migrated to the new system?
   - All current employees (10,000+) with full 201 records?
   - Historical payroll (how many years)?
   - Historical DTR (how many months)?
   - Active applicants in pool?
   - All clients and contracts?
   - All inventory items?
5. **[DETAIL]** What format is current data in? (Excel, MySQL, Oracle, paper-only.)
6. **[DETAIL]** Is there a parallel-run period planned (run new + old simultaneously to validate)?

### O3. Hardware / devices
7. **[DETAIL]** Biometric devices — brands, models, count, locations.
8. **[DETAIL]** Network connectivity at detachments — internet available? Speeds? Reliability?
9. **[DETAIL]** Will detachments use the system directly, or only HQ?

---

## PART P — Reporting / Dashboards / Analytics

**Respondent:** COO / HR Director / Department Heads

### P1. Executive dashboards
1. **[DETAIL]** Top 5 KPIs the executive team wants visible daily/weekly/monthly?
2. **[DETAIL]** Examples to confirm or expand:
   - Total deployed headcount
   - Bench / unposted headcount
   - Open requisitions
   - Fill rate (last 30 days)
   - SLA performance
   - Payroll run summary
   - Client satisfaction trend
   - Compliance status (licenses expiring, audits due)

### P2. Department dashboards
3. **[DETAIL]** What does each department head want to see daily?
4. **[DETAIL]** Field supervisors / detachment supervisors — what dashboards do they need (especially if mobile)?

### P3. Client-facing reports
5. **[DETAIL]** Do clients receive periodic reports? (Monthly attendance, incident reports, billing.)
6. **[DETAIL]** Do clients have a portal to view their own data?

---

## PART Q — Self-Service & Mobile

**Respondent:** HR Manager / IT Head

### Q1. Employee self-service
1. **[DETAIL]** Should guards have a self-service portal/app?
2. **[DETAIL]** What features? View payslip, view DTR, request leave, view assigned assets, view schedule, view training records, update contact info?
3. **[DETAIL]** Web-based, mobile app, or both?
4. **[DETAIL]** Smartphone availability — do most guards have smartphones?

### Q2. Supervisor self-service
5. **[DETAIL]** Should detachment supervisors have a mobile app for: approving DTR, reporting incidents, requesting reshuffles, reviewing team status?

### Q3. Client portal
6. **[DETAIL]** Should clients have a portal? View deployed guards, attendance, billing, request changes?

---

## PART R — Hosting, Security & Data

**Respondent:** IT Head / Compliance Officer

1. **[DETAIL]** Hosting preference — on-premise (agency's own servers), cloud (AWS, Azure, GCP), or hybrid?
2. **[DETAIL]** Are there regulatory or contractual requirements on data residency? (E.g., government clients may require PH-only hosting.)
3. **[DETAIL]** Backup and disaster recovery requirements — RPO/RTO?
4. **[DETAIL]** Data retention policy — how long are records kept? (Employee records typically 10+ years post-separation per Labor Code.)
5. **[DETAIL]** Data Privacy Act compliance — DPO assigned? Privacy Impact Assessment done?
6. **[DETAIL]** User authentication preference — username/password only, MFA, SSO with existing system?
7. **[DETAIL]** Audit log retention — how many years?

---

## PART S — Project Logistics

**Respondent:** Project Sponsor / Project Manager

1. **[DETAIL]** Who are the key stakeholders Noel will interact with weekly?
2. **[DETAIL]** Will the agency provide data extracts, sample documents, sample reports, sample forms upon request?
3. **[DETAIL]** Can Noel get access to a test environment / pilot detachment for early validation?
4. **[DETAIL]** Frequency of progress reviews?
5. **[DETAIL]** Change management — who handles training the agency's staff on the new system?
6. **[DETAIL]** Acceptance criteria — what defines a phase as "done" and ready for sign-off?

---

## PART T — Open-Ended Final Questions

**Respondent:** Anyone — particularly people who've worked at the agency a long time

1. **[DETAIL]** What is the single biggest workflow inefficiency you face today that you hope this system fixes?
2. **[DETAIL]** What is the single biggest mistake / failure mode you've seen that the system must prevent?
3. **[DETAIL]** What's something about how this agency operates that an outsider would never guess and that the system needs to handle?
4. **[DETAIL]** Are there any "informal" workflows (things not in the official manual but everyone does) that are critical to operations?
5. **[DETAIL]** Are there any current pain points caused by how different departments hand off work to each other?

---

## How Noel Should Use the Answers

Once these are filled in:

1. **Mark every assumption in `SENTINEL_HRIS_ARCHITECTURE.md` v1 as confirmed, corrected, or deleted.**
2. **Identify any new modules or workflows revealed.** Add to the module inventory in `SENTINEL_HRIS_CONVERSATION_LOG.md`.
3. **Flag any answers that conflict with each other** (different respondents say different things) and resolve before locking the design.
4. **Flag any answers that suggest gray-area legal practices.** Bring these to the labor lawyer consultation.
5. **Then — and only then — request v2 of the architecture doc.**

---

## What NOT to Do With This Document

- **Don't send all sections to one person.** Route by department; respect everyone's time.
- **Don't accept "we'll figure it out later" answers** for `[CRITICAL]` items. They drive the data model.
- **Don't assume your friend's account is the agency's account.** Friends know parts of the operation; only the actual department heads know their department's specifics.
- **Don't fill in answers yourself.** If a section is unanswered, leave it blank rather than guess. Speculation here becomes wrong code later.
