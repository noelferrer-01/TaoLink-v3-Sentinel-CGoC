# modules/compliance

## Purpose

Stores and exposes Philippine statutory rate tables (SSS, PhilHealth, Pag-IBIG, BIR WTAX) used by the payroll engine to compute mandatory deductions.

## Public API

Rate-lookup helpers land in Task 1.4. No public API yet.

## Dependencies

- **Env:** `DATABASE_URL`.
- **Modules:** none.
- **Tables:** `comp_sss_brackets`, `comp_philhealth_config`, `comp_pagibig_config`, `comp_wtax_brackets`.

## Known failure modes

Populated as failures are encountered.
