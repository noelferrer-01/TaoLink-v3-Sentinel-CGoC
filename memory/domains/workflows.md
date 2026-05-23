# Workflows — Module Contracts

> Prior thinking from `../../ref/sentinel-docs/sentinel-conversation-log.md` §8. These are *contracts* — the handoffs between modules. Write them BEFORE coding the module. Status: reference, not binding for v3 until validated against questionnaire answers.

## Marketing → Deployment → Recruitment (new client demand)

```
Marketing.RequestFormSubmitted (need 100 guards, requirements)
    ↓ approval gate
Marketing.RequestApproved
    ↓
Deployment receives demand
    ├─ Active employees available? → use first
    │     → Deployment.AssignmentCreated
    │
    └─ Applicant pool? → call them up
          → Recruitment.CandidateActivated
          → HR.EmployeeCreated (status: training or deployed)
          → Deployment.AssignmentCreated
    ↓
Shortfall? → Recruitment.HiringRequisitionOpened
```

⚠ **Commander Group practice diverges** — Recruitment may own the entire chain including assignment creation. See `../../wiki/decisions/0001-recruitment-vs-deployment-ownership.md`.

## Reshuffle (internal guard reassignment)

```
Operations triggers reshuffle (manual or system-suggested)
    ↓
Deployment.AssignmentEnded (Guard A leaves Detachment 1)
    ↓
Deployment.AssignmentCreated (Guard A starts at Detachment 2)
    ↓
Inventory check: does Guard A's assets match Detachment 2 needs?
    ↓ (if mismatch)
Inventory.AssetIssuanceRequired
```

## Hiring → Deployment

```
Recruitment.CandidateHired
    ↓
HR.EmployeeCreated (status: training)
    ↓
Training complete → status: bench/floating/deployable
    ↓
Deployment picks up → status: deployed at Client X
```

## DTR → Payroll

```
Biometric / QR-code / paper DTR ingestion → DTR records
    ↓
DTR period closes → DTR.PeriodClosed event
    ↓
Payroll consumes → calculates → Payroll.RunCompleted
    ↓
Payslips generated
```

⚠ **Commander Group critical:** DTR must split per CLIENT, not per employee globally. Guard transferred mid-period → billing splits across clients on the transfer date.

## Fulfillment SLA tracking (cross-cutting)

Every deployment event must carry a `marketing_request_id` foreign key so the chain is queryable end-to-end:
- **Time to fulfill:** `Marketing.RequestFormSubmitted` → all guards deployed
- **Fill rate:** requested vs delivered by deadline
- **Quality of fulfillment:** did deployed guards meet client requirements?

## Approval gates (Phase-0 primitive supports all of these)

| Action | Likely approver(s) |
|---|---|
| Marketing request → Deployment | Operations Manager |
| New client contract above ₱X | Executive / CEO |
| Reshuffle above N guards | Operations Manager |
| Hiring requisition | HR Manager + Operations |
| Loan above ₱X | Direct Supervisor + HR |
| Salary adjustment | HR Manager + Finance |
| Firearm issuance | Armorer + Operations Supervisor |
| Termination | HR Manager + Legal/Compliance |

Thresholds (₱X, N guards) are open — questionnaire Part N answers them.
