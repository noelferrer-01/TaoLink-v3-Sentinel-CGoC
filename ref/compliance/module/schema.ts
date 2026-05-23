import { mysqlTable, varchar, decimal, date, timestamp, uniqueIndex, index } from 'drizzle-orm/mysql-core';

// SSS Contribution Table — per SSC Resolution 560-s.2024 & SSS Circular 2024-006
// (effective 1 January 2025; final scheduled increase under RA 11199).
// Minimum MSC: ₱5,000, Maximum MSC: ₱35,000
// Combined Rate: 15% (Employer: 10%, Employee: 5%)
// WISP carve-out applies at MSC ≥ ₱20,000 (does not change employee take-home).
export const govSssContributionTable = mysqlTable('gov_sss_contribution_table', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  rangeStart: decimal('range_start', { precision: 12, scale: 2 }).notNull(),
  rangeEnd: decimal('range_end', { precision: 12, scale: 2 }).notNull(),
  monthlySalaryCredit: decimal('msc', { precision: 12, scale: 2 }).notNull(),

  // Breakdown
  eeShareRegular: decimal('ee_share_regular', { precision: 10, scale: 2 }).notNull(),
  erShareRegular: decimal('er_share_regular', { precision: 10, scale: 2 }).notNull(),
  eeShareWisp: decimal('ee_share_wisp', { precision: 10, scale: 2 }).default('0.00'),
  erShareWisp: decimal('er_share_wisp', { precision: 10, scale: 2 }).default('0.00'),

  effectiveDate: date('effective_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  effectiveDateIdx: index('sss_effective_idx').on(table.effectiveDate),
}));

// PhilHealth Config — per PhilHealth Circular 2019-0009 & RA 11223 (UHC Act).
// Final scheduled rate (5%) effective CY 2024 onwards; PIA confirmed no 2026 hike.
// Rate: 5%, Floor MBS: ₱10,000, Ceiling MBS: ₱100,000.
export const govPhilhealthConfig = mysqlTable('gov_philhealth_config', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  rate: decimal('rate', { precision: 5, scale: 4 }).notNull(), // e.g., 0.0500
  floor: decimal('floor', { precision: 12, scale: 2 }).notNull(), // 10,000
  ceiling: decimal('ceiling', { precision: 12, scale: 2 }).notNull(), // 100,000
  effectiveDate: date('effective_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  effectiveDateIdx: index('philhealth_effective_idx').on(table.effectiveDate),
}));

// Pag-IBIG Config — mandatory contributions per HDMF Circular 460 (Feb 2024) & RA 9679
// salary_cap = ₱10,000 → max mandatory EE = 2% × ₱10,000 = ₱200/month
export const govPagibigConfig = mysqlTable('gov_pagibig_config', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  eeRate: decimal('ee_rate', { precision: 5, scale: 4 }).notNull(), // 0.0200
  erRate: decimal('er_rate', { precision: 5, scale: 4 }).notNull(), // 0.0200
  salaryCap: decimal('salary_cap', { precision: 12, scale: 2 }).notNull(), // 10,000
  effectiveDate: date('effective_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  effectiveDateIdx: index('pagibig_effective_idx').on(table.effectiveDate),
}));

// Withholding Tax Table — per RA 10963 (TRAIN Law) Phase 2, effective 1 January 2023.
// Five non-zero brackets (15% / 20% / 25% / 30% / 35%) plus a 0% bracket on the first
// ₱20,833/month. TRAIN does not sunset in 2026 — these rates remain in force unless
// amended by future legislation.
export const govWtaxTable = mysqlTable('gov_wtax_table', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  frequency: varchar('frequency', { length: 20 }).notNull(), // MONTHLY, SEMI_MONTHLY
  rangeStart: decimal('range_start', { precision: 12, scale: 2 }).notNull(),
  rangeEnd: decimal('range_end', { precision: 12, scale: 2 }), // Nullable for top bracket
  baseTax: decimal('base_tax', { precision: 12, scale: 2 }).notNull(),
  percentageOver: decimal('percentage_over', { precision: 5, scale: 4 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  freqIdx: index('wtax_freq_idx').on(table.frequency),
}));

// De Minimis Ceilings — per BIR Revenue Regulations No. 29-2025 amending RR 2-98
// (effective 6 January 2026). Stored as monthly ceilings; annual benefits are divided
// by 12 at seed time. The OT/night-shift meal allowance (30% of basic minimum wage) is
// not a fixed peso ceiling and is excluded from this table.
export const govDeMinimisCeilings = mysqlTable('gov_de_minimis_ceilings', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  benefitName: varchar('benefit_name', { length: 100 }).notNull(), // Rice, Laundry, etc.
  monthlyCeiling: decimal('monthly_ceiling', { precision: 12, scale: 2 }).notNull(),
  code: varchar('code', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').onUpdateNow(),
}, (table) => ({
  codeIdx: uniqueIndex('benefit_code_idx').on(table.code),
}));
