import { pgTable, uuid, numeric, date, pgEnum, index, unique } from 'drizzle-orm/pg-core';

export const wtaxFrequency = pgEnum('wtax_frequency', ['MONTHLY', 'SEMI_MONTHLY']);

// SSS: each row is one Monthly Salary Credit bracket.
// Rate citation: SSC Resolution 560-s.2024 + SSS Circular 2024-006, effective 2025-01-01.
export const sssBrackets = pgTable('comp_sss_brackets', {
  id: uuid('id').primaryKey().defaultRandom(),
  rangeStart: numeric('range_start', { precision: 12, scale: 2 }).notNull(),
  rangeEnd: numeric('range_end', { precision: 12, scale: 2 }).notNull(),
  monthlySalaryCredit: numeric('monthly_salary_credit', { precision: 12, scale: 2 }).notNull(),
  eeShareRegular: numeric('ee_share_regular', { precision: 12, scale: 2 }).notNull(),
  erShareRegular: numeric('er_share_regular', { precision: 12, scale: 2 }).notNull(),
  // WISP shares are notNull (v2 used nullable + default). Seed code must
  // explicitly insert 0.00 for non-WISP brackets (MSC < ₱20,000).
  eeShareWisp: numeric('ee_share_wisp', { precision: 12, scale: 2 }).notNull(),
  erShareWisp: numeric('er_share_wisp', { precision: 12, scale: 2 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
}, (t) => ({
  mscIdx: index('comp_sss_msc_idx').on(t.monthlySalaryCredit),
  effDateIdx: index('comp_sss_eff_idx').on(t.effectiveDate),
  mscEffUq: unique('comp_sss_msc_eff_uq').on(t.monthlySalaryCredit, t.effectiveDate),
}));

// PhilHealth — one config row per effective date.
// Citation: PhilHealth Circular 2019-0009, 5% rate effective CY 2024 onwards (2026 same per PIA).
export const philhealthConfig = pgTable('comp_philhealth_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  rate: numeric('rate', { precision: 6, scale: 4 }).notNull(),
  floor: numeric('floor', { precision: 12, scale: 2 }).notNull(),
  ceiling: numeric('ceiling', { precision: 12, scale: 2 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
}, (t) => ({
  effUq: unique('comp_philhealth_eff_uq').on(t.effectiveDate),
}));

// Pag-IBIG — one config row per effective date.
// Citation: HDMF Circular 460, effective 2024-02 (supersedes Circular 274).
export const pagibigConfig = pgTable('comp_pagibig_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  eeRate: numeric('ee_rate', { precision: 6, scale: 4 }).notNull(),
  erRate: numeric('er_rate', { precision: 6, scale: 4 }).notNull(),
  salaryCap: numeric('salary_cap', { precision: 12, scale: 2 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
}, (t) => ({
  effUq: unique('comp_pagibig_eff_uq').on(t.effectiveDate),
}));

// BIR WTAX — bracket table, separate rows per frequency.
// Citation: RA 10963 (TRAIN Law) Phase 2 brackets, effective 2023-01-01.
export const wtaxBrackets = pgTable('comp_wtax_brackets', {
  id: uuid('id').primaryKey().defaultRandom(),
  frequency: wtaxFrequency('frequency').notNull(),
  rangeStart: numeric('range_start', { precision: 12, scale: 2 }).notNull(),
  rangeEnd: numeric('range_end', { precision: 12, scale: 2 }),  // null = open-ended top bracket
  baseTax: numeric('base_tax', { precision: 12, scale: 2 }).notNull(),
  percentageOver: numeric('percentage_over', { precision: 6, scale: 4 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
}, (t) => ({
  freqRangeIdx: index('comp_wtax_freq_range_idx').on(t.frequency, t.rangeStart),
  effDateIdx: index('comp_wtax_eff_idx').on(t.effectiveDate),
}));

export type SssBracket = typeof sssBrackets.$inferSelect;
export type PhilhealthConfig = typeof philhealthConfig.$inferSelect;
export type PagibigConfig = typeof pagibigConfig.$inferSelect;
export type WtaxBracket = typeof wtaxBrackets.$inferSelect;

export type NewSssBracket = typeof sssBrackets.$inferInsert;
export type NewPhilhealthConfig = typeof philhealthConfig.$inferInsert;
export type NewPagibigConfig = typeof pagibigConfig.$inferInsert;
export type NewWtaxBracket = typeof wtaxBrackets.$inferInsert;
