# Slice 1 — First Payslip: V2 Reconciliation Worksheet

**Done criterion #7** — Numbers must match v2's payroll engine output for the same inputs,
within ₱1 per line.

**Source of truth for all statutory rates:** `ref/compliance/seed-compliance.ts` (2026 seed,
cross-referenced below with statutory citations embedded in that file).

**Period:** 2026-05-16 → 2026-05-31 (SEMI_MONTHLY, final cut — `isFinalCutOfMonth = true`
because periodEnd day 31 ≥ 28).

**Payroll frequency:** `SEMI_MONTHLY` for all three cases.

**workDaysPerMonth:** 26 (CGoC guard standard, env var `WORK_DAYS_PER_MONTH`).

**daysWorked:** 13 for all three cases.

**OT hours:** 0 (not yet captured in Slice 1).

---

## Statutory Rate Reference (from `ref/compliance/seed-compliance.ts`)

### SSS (RA 11199, SSC Resolution 560-s.2024 + SSS Circular 2024-006, effective 2025-01-01)

Rate: combined 15% (EE 5% / ER 10%); MSC range ₱5,000 – ₱35,000 (step ₱500).

WISP threshold: MSC ≥ ₱20,000 → carve-out: EE 4% regular + 1% WISP; ER 8% regular + 2% WISP.
Below threshold: EE 5% regular, eeWisp = 0.

Engine: `sssEE = eeShareRegular + eeShareWisp` (monthly). Applied in full on the final cut.

### PhilHealth (RA 11223, PhilHealth Circular 2019-0009, 5% rate from CY 2024 onwards)

- Rate: 5%
- Floor: ₱10,000 (minimum monthly basis for premium)
- Ceiling: ₱100,000 (maximum monthly basis for premium)
- EE share: 50% of (capped basis × 5%)
- Formula: `EE = min(max(basic, 10000), 100000) × 0.05 ÷ 2`

### Pag-IBIG / HDMF (RA 9679, HDMF Circular 460, effective February 2024)

- EE rate: 2%
- Salary cap (Maximum Fund Salary): ₱10,000
- Formula: `EE = min(basic, 10000) × 0.02`
- Maximum mandatory EE contribution: ₱200/month

### BIR Withholding Tax (RA 10963 TRAIN Law Phase 2, effective 2023-01-01)

SEMI_MONTHLY brackets (monthly brackets ÷ 2, per BIR Revenue Memorandum Circular):

| Taxable (SEMI_MONTHLY) | Base Tax | % Over |
|---|---|---|
| ₱0.00 – ₱10,416.99 | ₱0.00 | 0% |
| ₱10,417.00 – ₱16,666.99 | ₱0.00 | 15% |
| ₱16,667.00 – ₱33,332.99 | ₱937.50 | 20% |
| ₱33,333.00 – ₱83,332.99 | ₱4,270.83 | 25% |
| ₱83,333.00 – ₱333,332.99 | ₱16,770.83 | 30% |
| ₱333,333.00 and above | ₱91,770.83 | 35% |

Engine uses `taxable >= rangeStart && taxable < rangeEnd` (note: strict less-than on rangeEnd).

---

## Case A — ₱14,000 Monthly Basic

### Step 1: Daily rate and gross

```
basicSalaryMonthly  = ₱14,000.00
workDaysPerMonth    = 26
daysWorked          = 13

dailyRate           = 14,000 / 26  = 538.461538...   (not rounded until final grossPay)
basicEarnings       = dailyRate × 13 = 14,000 × 13/26 = ₱7,000.00  (exact)
otPay               = 0 × (dailyRate/8) × 1.25 = ₱0.00
grossPay            = round2(max(0, 7,000.00 + 0.00)) = ₱7,000.00
```

### Step 2: SSS bracket lookup

Monthly salary ₱14,000.00. Seed formula: `rangeStart = msc - 250 = 13,750.00`, `rangeEnd = msc + 249.99 = 14,249.99`.
14,000.00 falls in [13,750.00, 14,249.99].

Since 14,000 < 20,000 (below WISP threshold): no WISP.

```
eeShareRegular = 14,000 × 0.05 = ₱700.00
eeShareWisp    = ₱0.00
sssEE (monthly)= ₱700.00 + ₱0.00 = ₱700.00

isFinalCutOfMonth = true → apply in full
sssEE = ₱700.00
```

### Step 3: PhilHealth

```
basis = min(max(14,000, 10,000), 100,000) = min(14,000, 100,000) = ₱14,000.00
EE    = 14,000 × 0.05 / 2 = ₱350.00
philhealthEE = ₱350.00
```

### Step 4: Pag-IBIG

```
basis = min(14,000, 10,000) = ₱10,000.00
EE    = 10,000 × 0.02 = ₱200.00
pagibigEE = ₱200.00
```

### Step 5: Taxable income

```
taxable = grossPay - sssEE - philhealthEE - pagibigEE
        = 7,000.00 - 700.00 - 350.00 - 200.00
        = ₱5,750.00
```

### Step 6: BIR WTAX (SEMI_MONTHLY bracket)

5,750.00 falls in bracket [₱0.00, ₱10,417.00) → baseTax = ₱0.00, percentageOver = 0%.

```
WTAX = 0 + (5,750.00 - 0) × 0 = ₱0.00
birWtax = ₱0.00
```

### Step 7: Net pay

```
netPay = 7,000.00 - 700.00 - 350.00 - 200.00 - 0.00 = ₱5,750.00
```

### Case A Summary

| Line | Expected |
|---|---|
| grossPay | ₱7,000.00 |
| sssEE | ₱700.00 |
| philhealthEE | ₱350.00 |
| pagibigEE | ₱200.00 |
| birWtax | ₱0.00 |
| netPay | ₱5,750.00 |

---

## Case B — ₱18,000 Monthly Basic

### Step 1: Daily rate and gross

```
basicSalaryMonthly  = ₱18,000.00
workDaysPerMonth    = 26
daysWorked          = 13

dailyRate           = 18,000 / 26  = 692.307692...
basicEarnings       = 18,000 × 13/26 = ₱9,000.00  (exact)
grossPay            = ₱9,000.00
```

### Step 2: SSS bracket lookup

Monthly salary ₱18,000.00. MSC = 18,000: `rangeStart = 17,750.00`, `rangeEnd = 18,249.99`.
18,000.00 falls in [17,750.00, 18,249.99].

Since 18,000 < 20,000 (below WISP threshold): no WISP.

```
eeShareRegular = 18,000 × 0.05 = ₱900.00
eeShareWisp    = ₱0.00
sssEE          = ₱900.00
```

### Step 3: PhilHealth

```
basis = min(max(18,000, 10,000), 100,000) = ₱18,000.00
EE    = 18,000 × 0.05 / 2 = ₱450.00
philhealthEE = ₱450.00
```

### Step 4: Pag-IBIG

```
basis = min(18,000, 10,000) = ₱10,000.00
EE    = 10,000 × 0.02 = ₱200.00
pagibigEE = ₱200.00
```

### Step 5: Taxable income

```
taxable = 9,000.00 - 900.00 - 450.00 - 200.00 = ₱7,450.00
```

### Step 6: BIR WTAX (SEMI_MONTHLY bracket)

7,450.00 falls in bracket [₱0.00, ₱10,417.00) → 0%.

```
birWtax = ₱0.00
```

### Step 7: Net pay

```
netPay = 9,000.00 - 900.00 - 450.00 - 200.00 - 0.00 = ₱7,450.00
```

### Case B Summary

| Line | Expected |
|---|---|
| grossPay | ₱9,000.00 |
| sssEE | ₱900.00 |
| philhealthEE | ₱450.00 |
| pagibigEE | ₱200.00 |
| birWtax | ₱0.00 |
| netPay | ₱7,450.00 |

Note: Case B is independently validated by the existing happy-path test in `modules/payroll/payroll.test.ts`
(Test 1), which asserts identical values. This worksheet provides the hand-computed audit trail.

---

## Case C — ₱28,000 Monthly Basic

### Step 1: Daily rate and gross

```
basicSalaryMonthly  = ₱28,000.00
workDaysPerMonth    = 26
daysWorked          = 13

dailyRate           = 28,000 / 26  = 1,076.923076...
basicEarnings       = 28,000 × 13/26 = ₱14,000.00  (exact)
grossPay            = ₱14,000.00
```

### Step 2: SSS bracket lookup

Monthly salary ₱28,000.00. MSC = 28,000: `rangeStart = 27,750.00`, `rangeEnd = 28,249.99`.
28,000.00 falls in [27,750.00, 28,249.99].

Since 28,000 ≥ 20,000 (above WISP threshold): WISP applies.

```
eeShareRegular = 28,000 × 0.04 = ₱1,120.00   (4% of MSC)
eeShareWisp    = 28,000 × 0.01 = ₱280.00     (1% of MSC, WISP carve-out)
sssEE (monthly)= 1,120.00 + 280.00 = ₱1,400.00
```

WISP carve-out does NOT change take-home pay; total EE contribution is still 5% (same ₱1,400.00).
The split is for SSS R-5/R-3 remittance reporting only.

```
sssEE = ₱1,400.00
```

### Step 3: PhilHealth

```
basis = min(max(28,000, 10,000), 100,000) = ₱28,000.00
EE    = 28,000 × 0.05 / 2 = ₱700.00
philhealthEE = ₱700.00
```

### Step 4: Pag-IBIG

```
basis = min(28,000, 10,000) = ₱10,000.00    (capped at MFS)
EE    = 10,000 × 0.02 = ₱200.00
pagibigEE = ₱200.00
```

### Step 5: Taxable income

```
taxable = 14,000.00 - 1,400.00 - 700.00 - 200.00 = ₱11,700.00
```

### Step 6: BIR WTAX (SEMI_MONTHLY bracket)

11,700.00 falls in bracket [₱10,417.00, ₱16,667.00) → baseTax = ₱0.00, percentageOver = 15%.

```
WTAX = 0.00 + (11,700.00 - 10,417.00) × 0.15
     = 1,283.00 × 0.15
     = ₱192.45
birWtax = ₱192.45
```

### Step 7: Net pay

```
netPay = 14,000.00 - 1,400.00 - 700.00 - 200.00 - 192.45 = ₱11,507.55
```

### Case C Summary

| Line | Expected |
|---|---|
| grossPay | ₱14,000.00 |
| sssEE | ₱1,400.00 |
| philhealthEE | ₱700.00 |
| pagibigEE | ₱200.00 |
| birWtax | ₱192.45 |
| netPay | ₱11,507.55 |

---

## Three-Case Reference Table

| Line | Case A (₱14k) | Case B (₱18k) | Case C (₱28k) |
|---|---|---|---|
| Monthly basic | ₱14,000.00 | ₱18,000.00 | ₱28,000.00 |
| Daily rate (÷26) | ₱538.46 | ₱692.31 | ₱1,076.92 |
| Days worked | 13 | 13 | 13 |
| grossPay | ₱7,000.00 | ₱9,000.00 | ₱14,000.00 |
| sssEE | ₱700.00 | ₱900.00 | ₱1,400.00 |
| philhealthEE | ₱350.00 | ₱450.00 | ₱700.00 |
| pagibigEE | ₱200.00 | ₱200.00 | ₱200.00 |
| birWtax | ₱0.00 | ₱0.00 | ₱192.45 |
| **netPay** | **₱5,750.00** | **₱7,450.00** | **₱11,507.55** |

---

## Rounding and Convention Notes

1. **Gross pay** — engine does not round intermediate steps (dailyRate, basicEarnings). `round2` is
   applied once to the final `basicEarnings + otPay` sum. All three cases produce exact whole numbers
   because `basicSalary × 13 / 26 = basicSalary / 2`, so no rounding occurs.

2. **SSS** — bracket look up is on the full monthly salary (not the semi-monthly gross). SEMI_MONTHLY
   convention: full monthly statutory amount applied on final cut, ₱0 on first cut.

3. **PhilHealth** — `Math.round(basis × rate / 2 × 100) / 100` per compliance service. All three
   cases produce exact values; no rounding artifacts.

4. **Pag-IBIG** — capped salary basis always ₱10,000 for salaries ≥ ₱10,000, giving exactly ₱200.
   No rounding artifact.

5. **BIR WTAX** — computed as `round2(baseTax + (taxable - rangeStart) × percentageOver)`. For Cases A
   and B, the result is ₱0 (exact). For Case C: 1,283.00 × 0.15 = 192.45 (exact, no rounding needed).

6. **Tolerance** — the integration test asserts `Math.abs(actual - expected) < 1.00`. All expected
   values in this worksheet have zero rounding uncertainty; the engine should reproduce them exactly.

---

## Source Citations

| Rate | Statutory Basis | Source in Codebase |
|---|---|---|
| SSS EE 5% (regular + WISP) | RA 11199; SSC Resolution 560-s.2024; SSS Circular 2024-006 | `ref/compliance/seed-compliance.ts` lines 20–67 |
| PhilHealth 5% rate | RA 11223; PhilHealth Circular 2019-0009 | `ref/compliance/seed-compliance.ts` lines 76–84 |
| Pag-IBIG 2% / ₱10k cap | RA 9679; HDMF Circular 460 (Feb 2024) | `ref/compliance/seed-compliance.ts` lines 93–101 |
| BIR SEMI_MONTHLY brackets | RA 10963 TRAIN Phase 2; BIR Revenue Memorandum Circular | `ref/compliance/seed-compliance.ts` lines 118–125 |

Last verified: 2026-05-24 (Sentinel Task 6.9 — Done criterion #7).
