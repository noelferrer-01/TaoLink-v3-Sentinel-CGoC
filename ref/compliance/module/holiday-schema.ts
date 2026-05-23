import { mysqlTable, varchar, date, decimal, mysqlEnum, timestamp, index } from 'drizzle-orm/mysql-core';

/**
 * Holiday Calendar
 * Tracks regular and special non-working days per Philippine labor law.
 *
 * Pay multipliers (Labor Code of the Philippines):
 *   Regular Holiday: 200% (worked) / 100% (unworked)
 *   Special Non-Working Day: 130% (worked) / 0% (unworked)
 *   Special Working Day: 100% + 30% premium
 */
export const govHolidays = mysqlTable('gov_holidays', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  holidayDate: date('holiday_date').notNull(),
  type: mysqlEnum('type', ['REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING']).notNull(),

  // Pay multiplier for work performed on this holiday (e.g., 2.00 for Regular)
  workedMultiplier: decimal('worked_multiplier', { precision: 4, scale: 2 }).notNull(),
  // Pay multiplier for unworked holiday (e.g., 1.00 for Regular, 0 for Special)
  unworkedMultiplier: decimal('unworked_multiplier', { precision: 4, scale: 2 }).notNull(),

  year: varchar('year', { length: 4 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').onUpdateNow(),
}, (table) => {
  return {
    dateIdx: index('holiday_date_idx').on(table.holidayDate),
    yearIdx: index('holiday_year_idx').on(table.year),
  };
});
