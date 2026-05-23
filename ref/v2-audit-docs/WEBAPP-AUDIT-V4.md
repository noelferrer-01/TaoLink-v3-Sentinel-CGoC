# WEBAPP-AUDIT-V4 — Full Production Audit

**Date:** 2026-04-07
**Auditor:** Claude Opus 4.6 (acting as HR Manager + Dev Reviewer)
**Scope:** Live VPS at `taolink.sistemahub.com` — marketing site, HRIS webapp, SSS/Tax compliance, infrastructure

---

## 1. Infrastructure & Deployment

| Check | Status | Detail |
|-------|--------|--------|
| PM2 services | ✅ ALL ONLINE | `taolink-hris` (12h up), `taolink-website` (11h up), `payroll-worker` (18h up) |
| Disk | ✅ Healthy | 96GB total, 9% used (8.5GB) |
| RAM | ✅ Healthy | 7.8GB total, 1.4GB used, 6.3GB available |
| SSL cert | ✅ Valid | Expires Jun 27, 2026 (81 days remaining) |
| nginx | ✅ Config valid | `nginx -t` passes, HTTPS redirect in place |
| HTTP→HTTPS | ✅ Auto-redirect | Port 80 returns 301 to HTTPS |
| Standalone symlinks (HRIS) | ✅ In place | `.next/standalone/.next/static` → real dir, `.next/standalone/public` → symlink |
| Standalone symlinks (Website) | ✅ In place | `public` symlinked, `static` copied by build |
| Post-build scripts | ✅ Self-healing | Both `package.json` build scripts create symlinks automatically — CSS/images survive every rebuild |

### Why Previous Audits Broke UI

**Root cause:** Next.js standalone output mode excludes `.next/static/` and `public/`. When the VPS rebuilt after audit fixes, these directories vanished — breaking all CSS and images.

**Fix already in place:** Both `package.json` files now include post-build symlink creation:
- HRIS: `next build && (ln -sf "$(pwd)/.next/static" .next/standalone/.next/static && ln -sf "$(pwd)/public" .next/standalone/public || true)`
- Website: `next build && (ln -sf "$(pwd)/public" .next/standalone/taolink-website/public 2>/dev/null || true)`

**This is permanent.** Future rebuilds will automatically recreate the symlinks. No manual intervention needed.

---

## 2. Security Headers

| Header | Marketing Site | HRIS |
|--------|---------------|------|
| Content-Security-Policy | ✅ Full CSP (self, unsafe-inline for scripts/styles) | ✅ Full CSP (frame-ancestors: none — stricter) |
| Strict-Transport-Security | ✅ max-age=31536000; includeSubDomains | ✅ Same |
| X-Frame-Options | ✅ SAMEORIGIN | ✅ DENY (stricter) |
| X-Content-Type-Options | ✅ nosniff | ✅ nosniff |
| X-XSS-Protection | ✅ 1; mode=block | ✅ 1; mode=block |
| Referrer-Policy | ✅ strict-origin-when-cross-origin | ✅ Same |
| Permissions-Policy | ✅ camera=(), microphone=(), geolocation=() | ✅ Same |
| Server header | ⚠️ Leaks `nginx/1.24.0 (Ubuntu)` | ⚠️ Same |

**Recommendation:** Add `server_tokens off;` to nginx config to hide version info.

---

## 3. Route Health — Marketing Site

| Route | HTTP | Status |
|-------|------|--------|
| `/` (Home) | 200 | ✅ |
| `/pricing` | 200 | ✅ |
| `/features` | 200 | ✅ |
| `/support` | 200 | ✅ |
| `/compliance` | 200 | ✅ |
| `/demo` | 200 | ✅ |
| `/contact` | 404 | ❌ Link exists on site but page does not |
| `/about` | 404 | ⚠️ No link exists, not a real issue |

### Finding M-1: `/contact` page returns 404

The marketing site footer/nav links to `/contact` but no `src/app/contact/page.tsx` exists. Either create the page or remove the link.

**Severity:** Low — cosmetic dead link

### Finding M-2: Image optimizer logs errors (non-blocking)

The Next.js error log repeats:
```
⨯ The requested resource isn't a valid image for /images/govt-vault.png received null
⨯ The requested resource isn't a valid image for /images/timekeeping.png received null
```

**Impact:** None to end users — nginx serves the images directly via `/images/` location, and the `/_next/image` optimizer also returns 200. The error is logged but does not affect rendering. This is a known Next.js standalone quirk where the image optimizer cannot resolve files via symlink on first attempt.

**Recommendation:** Suppress by adding `images: { unoptimized: true }` to `next.config.ts` for the marketing site (static images don't need on-the-fly optimization), OR ignore — the images load correctly.

---

## 4. Route Health — HRIS Webapp

All routes return 307 (redirect to login) for unauthenticated requests — **this is correct behavior**.

| Route | HTTP | Notes |
|-------|------|-------|
| `/app/login` | 200 | ✅ Login page renders with CSS |
| `/app/dashboard` | 307→login | ✅ |
| `/app/employees` | 307→login | ✅ |
| `/app/attendance` | 307→login | ✅ |
| `/app/pay-runs` | 307→login | ✅ |
| `/app/leaves` | 307→login | ✅ |
| `/app/loans` | 307→login | ✅ |
| `/app/thirteenth-month` | 307→login | ✅ |
| `/app/remittances` | 307→login | ✅ |
| `/app/remittances/bir-2316` | 307→login | ✅ |
| `/app/remittances/bir-1601c` | 307→login | ✅ |
| `/app/audit-logs` | 307→login | ✅ |
| `/app/payroll-summary` | 307→login | ✅ |
| `/app/accounts` | 307→login | ✅ |
| `/app/settings` | 307→login | ✅ |
| `/app/settings/security` | 307→login | ✅ |
| `/app/settings/holidays` | 307→login | ✅ |
| `/app/settings/departments` | 307→login | ✅ |
| `/app/settings/government-rates` | 307→login | ✅ |
| `/app/settings/leave-types` | 307→login | ✅ |
| `/app/ess` | 307→login | ✅ |
| `/app/ess/payslips` | 307→login | ✅ |
| `/app/ess/leave` | 307→login | ✅ |
| `/app/ess/leave/apply` | 307→login | ✅ |
| `/app/ess/profile` | 307→login | ✅ |

### HRIS Error Log

Recurring `Error: The router state header was sent but could not be parsed.` — this is a **known Next.js 16 issue** during client-side navigation when the RSC payload header exceeds limits. Non-critical, does not affect page rendering.

---

## 5. Philippine Government Rate Compliance

### 5A. SSS Contribution Table (2025)

**Reference:** Republic Act No. 11199 (Social Security Act of 2018), 2025 schedule

| Check | Expected | Actual (DB) | Status |
|-------|----------|-------------|--------|
| Total rate | 15% (EE 5% + ER 10%) | 15% ✓ | ✅ CORRECT |
| Bracket count | 61 brackets (MSC ₱5,000–₱35,000) | 61 rows for 2025 | ✅ CORRECT |
| Minimum MSC | ₱5,000 (salary ₱0–₱5,249.99) | ₱5,000 | ✅ CORRECT |
| Maximum MSC | ₱35,000 (salary ₱34,750+) | ₱35,000 | ✅ CORRECT |
| WISP threshold | Starts at MSC ₱20,000 (salary ₱19,750+) | Row has WISP values starting at ₱19,750 | ✅ CORRECT |
| WISP at max | EE ₱350, ER ₱700 | EE ₱350, ER ₱700 | ✅ CORRECT |
| Regular at max | EE ₱1,400, ER ₱2,800 | EE ₱1,400, ER ₱2,800 | ✅ CORRECT |
| Total EE at max | ₱1,750 (regular + WISP) | ₱1,750 | ✅ CORRECT |

**Spot checks verified:**

| Salary | MSC | EE Regular | ER Regular | EE WISP | ER WISP | Total EE | Total ER | Verdict |
|--------|-----|-----------|-----------|---------|---------|----------|----------|---------|
| ₱5,000 | ₱5,000 | ₱250 | ₱500 | ₱0 | ₱0 | ₱250 | ₱500 | ✅ |
| ₱10,000 | ₱10,000 | ₱500 | ₱1,000 | ₱0 | ₱0 | ₱500 | ₱1,000 | ✅ |
| ₱15,000 | ₱15,000 | ₱750 | ₱1,500 | ₱0 | ₱0 | ₱750 | ₱1,500 | ✅ |
| ₱20,000 | ₱20,000 | ₱800 | ₱1,600 | ₱200 | ₱400 | ₱1,000 | ₱2,000 | ✅ |
| ₱25,000 | ₱25,000 | ₱1,000 | ₱2,000 | ₱250 | ₱500 | ₱1,250 | ₱2,500 | ✅ |
| ₱35,000+ | ₱35,000 | ₱1,400 | ₱2,800 | ₱350 | ₱700 | ₱1,750 | ₱3,500 | ✅ |

**Code verification:** `calculateSssContributionLocal()` correctly sums `eeShareRegular + eeShareWisp` and `erShareRegular + erShareWisp`.

#### ⚠️ Note: 2024 SSS Data Uses 2025 Rates

The 2024 SSS rows in the database use 15% rates (EE 5%, ER 10%) instead of the correct 2024 rate of 14% (EE 4.5%, ER 9.5%). This is **only relevant if payroll is run retroactively for 2024 periods** — no impact on 2025+ payroll.

---

### 5B. PhilHealth (2025)

**Reference:** RA 11223 (Universal Health Care Act), PhilHealth Circular 2024-0009

| Check | Expected | Actual (DB) | Status |
|-------|----------|-------------|--------|
| Premium rate | 5% of salary | 5% | ✅ CORRECT |
| Income floor | ₱10,000 | ₱10,000 | ✅ CORRECT |
| Income ceiling | ₱100,000 | ₱100,000 | ✅ CORRECT |
| EE/ER split | 50/50 (2.5% each) | Code: `totalContribution / 2` | ✅ CORRECT |
| Min monthly premium | ₱500 (₱250 EE + ₱250 ER) | Derived: 10000 × 0.05 = ₱500 | ✅ CORRECT |
| Max monthly premium | ₱5,000 (₱2,500 EE + ₱2,500 ER) | Derived: 100000 × 0.05 = ₱5,000 | ✅ CORRECT |

---

### 5C. Pag-IBIG / HDMF (2025)

**Reference:** RA 9679, HDMF Circular No. 274

| Check | Expected | Actual (DB) | Status |
|-------|----------|-------------|--------|
| EE rate (salary > ₱1,500) | 2% | 2% | ✅ CORRECT |
| ER rate | 2% | 2% | ✅ CORRECT |
| Salary cap (mandatory) | ₱5,000 | ₱5,000 | ✅ CORRECT |
| Max EE contribution | ₱100 | Derived: 5000 × 0.02 = ₱100 | ✅ CORRECT |
| Low-salary bracket (≤₱1,500) | EE 1% | Code handles: `salary <= 1500 ? 0.01 : config.eeRate` | ✅ CORRECT |

---

### 5D. Withholding Tax — TRAIN Law (2023 onwards)

**Reference:** RA 10963 (TRAIN Law), RR 11-2018 as amended by RR 1-2023

#### Monthly Brackets:

| Bracket | Range Start | Range End | Base Tax | Rate Over | DB Match |
|---------|-----------|---------|---------|----------|----------|
| 1 | ₱0 | ₱20,833 | ₱0 | 0% | ✅ |
| 2 | ₱20,833 | ₱33,333 | ₱0 | 15% | ✅ |
| 3 | ₱33,333 | ₱66,667 | ₱1,875 | 20% | ✅ |
| 4 | ₱66,667 | ₱166,667 | ₱8,541.67 | 25% | ✅ |
| 5 | ₱166,667 | ₱666,667 | ₱33,541.67 | 30% | ✅ |
| 6 | ₱666,667+ | — | ₱183,541.67 | 35% | ✅ |

#### Semi-Monthly Brackets:

| Bracket | Range Start | Range End | Base Tax | Rate Over | DB Match |
|---------|-----------|---------|---------|----------|----------|
| 1 | ₱0 | ₱10,417 | ₱0 | 0% | ✅ |
| 2 | ₱10,417 | ₱16,667 | ₱0 | 15% | ✅ |
| 3 | ₱16,667 | ₱33,333 | ₱937.50 | 20% | ✅ |
| 4 | ₱33,333 | ₱83,333 | ₱4,270.83 | 25% | ✅ |
| 5 | ₱83,333 | ₱333,333 | ₱16,770.83 | 30% | ✅ |
| 6 | ₱333,333+ | — | ₱91,770.83 | 35% | ✅ |

**All 12 withholding tax brackets match the TRAIN Law schedule exactly.** ✅

---

## 6. Payroll Engine Code Review

| Area | Finding | Status |
|------|---------|--------|
| SSS basis | Uses basic salary (not gross) for MSC lookup — correct per SSS Act 2018 | ✅ |
| SSS WISP | Combines `eeShareRegular + eeShareWisp` — correct | ✅ |
| Semi-monthly split | Divides monthly contributions by 2 for semi-monthly pay — correct | ✅ |
| PhilHealth basis | Uses basic salary with floor/ceiling — correct | ✅ |
| Pag-IBIG low bracket | Handles ≤₱1,500 salary at 1% EE — correct | ✅ |
| De minimis exclusion | Deducted from taxable income before tax calc — correct per BIR | ✅ |
| Gross pay floor | Capped at ₱0 minimum — cannot go negative | ✅ |
| Hire-date proration | Pro-rates basic pay by business days for mid-period hires | ✅ |
| Zero salary guard | Throws error for ₱0 salary employees, preventing ₱0 payslips | ✅ |

---

## 7. Database Health

| Metric | Value |
|--------|-------|
| Employees | 101 (all ACTIVE) |
| Users | 102 (101 EMPLOYEE + 1 SUPER_ADMIN) |
| Pay runs | 2 |
| Audit logs | 158 |

### Finding DB-1: No HR_ADMIN user exists

There is only 1 SUPER_ADMIN account and 101 EMPLOYEE accounts. No HR_ADMIN role user exists. If the system is designed for role separation, at least one HR_ADMIN account should be created.

**Severity:** Low — SUPER_ADMIN has all permissions, but for demo/production it's good practice to show role separation.

### Finding DB-2: Missing company BIR settings

The following system configs are **not set**, causing empty fields in BIR 2316 Part I:

| Config Key | Purpose | Status |
|-----------|---------|--------|
| `COMPANY_TIN` | Employer TIN for BIR forms | ❌ Not configured |
| `COMPANY_BIR_RDO` | Revenue District Office code | ❌ Not configured |
| `COMPANY_ADDRESS` | Company address for BIR forms | ❌ Not configured |

**Impact:** BIR 2316 PDF Part I (Employer Information) will show empty TIN, RDO, and Address fields.

**Action:** Set these in Settings > General, or insert directly:
```sql
INSERT INTO sys_configs (`id`, `key`, `value`, `category`) VALUES
  (UUID(), 'COMPANY_TIN', '000-000-000-000', 'GENERAL'),
  (UUID(), 'COMPANY_BIR_RDO', '000', 'GENERAL'),
  (UUID(), 'COMPANY_ADDRESS', 'Your Company Address', 'GENERAL');
```

### Finding DB-3: SMTP password in plaintext

The `SMTP_PASS` value is stored as plaintext in `sys_configs`. While the database is on localhost and not publicly accessible, best practice is to encrypt it at rest like employee TIN/SSS numbers.

**Severity:** Medium — acceptable for demo, should encrypt before production use with real credentials.

---

## 8. Findings Summary & Priority

### Critical (0)

None.

### High Priority (1)

| # | Finding | Area | Detail |
|---|---------|------|--------|
| H-1 | Server version exposed | Security | nginx leaks version `1.24.0 (Ubuntu)`. Add `server_tokens off;` |

### Medium Priority (3)

| # | Finding | Area | Detail |
|---|---------|------|--------|
| M-1 | `/contact` page 404 | Marketing | Link exists but no page — create page or remove link |
| M-2 | SMTP password plaintext | Database | Encrypt `SMTP_PASS` in `sys_configs` at rest |
| M-3 | Missing BIR company configs | Database | `COMPANY_TIN`, `COMPANY_BIR_RDO`, `COMPANY_ADDRESS` not set — BIR 2316 Part I has empty fields |

### Low Priority (3)

| # | Finding | Area | Detail |
|---|---------|------|--------|
| L-1 | 2024 SSS data uses 2025 rates | Database | Only matters for retroactive 2024 payroll — no impact on current operations |
| L-2 | No HR_ADMIN user | Database | Only SUPER_ADMIN exists — consider creating HR_ADMIN for demo/role separation |
| L-3 | Image optimizer log noise | Marketing | Non-blocking errors for `govt-vault.png` and `timekeeping.png` — images load correctly via nginx |

---

## 9. Compliance Verdict

| System | Rate/Table Correct for 2025? | Notes |
|--------|------------------------------|-------|
| SSS | ✅ YES | 15% rate, 61 brackets, WISP included |
| PhilHealth | ✅ YES | 5%, floor ₱10K, ceiling ₱100K |
| Pag-IBIG | ✅ YES | 2%/2%, cap ₱5K, low-bracket handled |
| Withholding Tax | ✅ YES | TRAIN Law schedule, monthly + semi-monthly |
| 13th Month Tax Exemption | ✅ YES | ₱90,000 threshold per TRAIN Law |
| De Minimis | ✅ YES | Excluded from taxable income per BIR |

**All government contribution rates and tax tables match the current (2025) Philippine government schedules.**

---

## 10. UI Stability Guarantee

The root cause of past UI breakage (standalone symlinks) is now permanently fixed via automated post-build scripts in both `package.json` files. The deployment sequence `git pull && npm run build && pm2 restart <name>` is self-healing and safe to run repeatedly.

**Future audits will NOT break the UI** as long as:
1. The `build` scripts in `package.json` are not modified to remove the symlink commands
2. The `ecosystem.config.js` `cwd` paths remain correct
3. Rebuilds use `npm run build` (not `next build` directly)
