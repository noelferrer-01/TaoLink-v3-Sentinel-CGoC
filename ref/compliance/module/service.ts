import { db } from '@/db';
import {
  govSssContributionTable,
  govPhilhealthConfig,
  govPagibigConfig,
  govWtaxTable,
  govDeMinimisCeilings
} from './schema';
import { govHolidays } from './holiday-schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const ComplianceService = {
  // SSS — latest effective date schedule
  async getSssTable(effectiveDate?: string) {
    if (effectiveDate) {
      return await db.select().from(govSssContributionTable)
        .where(sql`${govSssContributionTable.effectiveDate} = ${effectiveDate}`)
        .orderBy(govSssContributionTable.rangeStart);
    }
    // Get all rows — they share one effective_date for now; group by date if multiple schedules exist
    const allRows = await db.select().from(govSssContributionTable)
      .orderBy(desc(govSssContributionTable.effectiveDate), govSssContributionTable.rangeStart);
    if (allRows.length === 0) return [];
    // Return only the latest schedule (all rows sharing the most recent effective_date)
    const latestDate = allRows[0].effectiveDate;
    return allRows.filter(r => String(r.effectiveDate) === String(latestDate));
  },

  // SSS — all distinct effective dates
  async getSssEffectiveDates() {
    const rows = await db.selectDistinct({ effectiveDate: govSssContributionTable.effectiveDate })
      .from(govSssContributionTable)
      .orderBy(desc(govSssContributionTable.effectiveDate));
    return rows.map(r => r.effectiveDate);
  },

  // PhilHealth
  async getPhilhealthConfig() {
    const results = await db.select().from(govPhilhealthConfig).orderBy(desc(govPhilhealthConfig.effectiveDate)).limit(1);
    return results[0] || null;
  },

  // PhilHealth — all configs (history)
  async getPhilhealthHistory() {
    return await db.select().from(govPhilhealthConfig).orderBy(desc(govPhilhealthConfig.effectiveDate));
  },

  // Pag-IBIG
  async getPagibigConfig() {
    const results = await db.select().from(govPagibigConfig).orderBy(desc(govPagibigConfig.effectiveDate)).limit(1);
    return results[0] || null;
  },

  // Pag-IBIG — all configs (history)
  async getPagibigHistory() {
    return await db.select().from(govPagibigConfig).orderBy(desc(govPagibigConfig.effectiveDate));
  },

  // W-Tax — latest effective date schedule
  async getWtaxTable(frequency: string = 'MONTHLY', effectiveDate?: string) {
    if (effectiveDate) {
      return await db.select().from(govWtaxTable)
        .where(and(eq(govWtaxTable.frequency, frequency), sql`${govWtaxTable.effectiveDate} = ${effectiveDate}`))
        .orderBy(govWtaxTable.rangeStart);
    }
    const allRows = await db.select().from(govWtaxTable)
      .where(eq(govWtaxTable.frequency, frequency))
      .orderBy(desc(govWtaxTable.effectiveDate), govWtaxTable.rangeStart);
    if (allRows.length === 0) return [];
    const latestDate = allRows[0].effectiveDate;
    return allRows.filter(r => String(r.effectiveDate) === String(latestDate));
  },

  // W-Tax — all distinct effective dates
  async getWtaxEffectiveDates() {
    const rows = await db.selectDistinct({ effectiveDate: govWtaxTable.effectiveDate })
      .from(govWtaxTable)
      .orderBy(desc(govWtaxTable.effectiveDate));
    return rows.map(r => r.effectiveDate);
  },

  // De Minimis
  async getDeMinimisCeilings() {
    return await db.select().from(govDeMinimisCeilings);
  },

  // Calculations
  async calculateSssContribution(taxableIncome: number) {
    const table = await this.getSssTable(); // ordered by rangeStart ASC

    if (table.length === 0) return { eeShare: 0, erShare: 0, msc: 0 };

    // Below first bracket → use first row (minimum MSC)
    const firstRow = table[0];
    if (taxableIncome <= 0 || taxableIncome < Number(firstRow.rangeStart)) {
      return {
        eeShare: Number(firstRow.eeShareRegular) + Number(firstRow.eeShareWisp || 0),
        erShare: Number(firstRow.erShareRegular) + Number(firstRow.erShareWisp || 0),
        msc: Number(firstRow.monthlySalaryCredit)
      };
    }

    // Above last bracket → use last row (maximum MSC)
    const lastRow = table[table.length - 1];
    const lastRangeEnd = Number(lastRow.rangeEnd);
    if (lastRangeEnd > 0 && taxableIncome > lastRangeEnd) {
      return {
        eeShare: Number(lastRow.eeShareRegular) + Number(lastRow.eeShareWisp || 0),
        erShare: Number(lastRow.erShareRegular) + Number(lastRow.erShareWisp || 0),
        msc: Number(lastRow.monthlySalaryCredit)
      };
    }

    // Find the matching bracket
    const row = table.find(r => {
      const start = Number(r.rangeStart);
      const end = Number(r.rangeEnd);
      // Last row (rangeEnd = 0 or null) matches anything >= rangeStart
      if (end === 0 || r.rangeEnd === null) return taxableIncome >= start;
      return taxableIncome >= start && taxableIncome <= end;
    });

    const matched = row || lastRow;
    return {
      eeShare: Number(matched.eeShareRegular) + Number(matched.eeShareWisp || 0),
      erShare: Number(matched.erShareRegular) + Number(matched.erShareWisp || 0),
      msc: Number(matched.monthlySalaryCredit)
    };
  },

  async calculatePhilhealth(salary: number) {
    const config = await this.getPhilhealthConfig();
    if (!config) return { eeShare: 0, erShare: 0 };

    const rate = Number(config.rate); // It's already the total rate e.g. 0.05
    const ceiling = Number(config.ceiling);
    const floor = Number(config.floor);

    const baseAmount = Math.max(floor, Math.min(salary, ceiling));
    const totalContribution = baseAmount * rate;
    
    return {
      eeShare: totalContribution / 2,
      erShare: totalContribution / 2
    };
  },

  async calculatePagibig(salary: number) {
    const config = await this.getPagibigConfig();
    if (!config) return { eeShare: 0, erShare: 0 };

    const maxSalary = Number(config.salaryCap);
    const salaryBase = Math.min(salary, maxSalary);
    
    return {
      eeShare: salaryBase * Number(config.eeRate),
      erShare: salaryBase * Number(config.erRate)
    };
  },

  /**
   * Returns the total monthly de minimis ceiling (sum of all benefit ceilings).
   * For semi-monthly, divide by 2.
   */
  async getTotalDeMinimisCeiling(): Promise<number> {
    const ceilings = await this.getDeMinimisCeilings();
    return ceilings.reduce((sum, c) => sum + Number(c.monthlyCeiling), 0);
  },

  // --- Holidays ---
  async getHolidaysByYear(year: string) {
    return await db.select().from(govHolidays)
      .where(eq(govHolidays.year, year))
      .orderBy(govHolidays.holidayDate);
  },

  async getHolidaysInRange(startDate: Date, endDate: Date) {
    return await db.select().from(govHolidays)
      .where(and(
        gte(govHolidays.holidayDate, startDate),
        lte(govHolidays.holidayDate, endDate)
      ))
      .orderBy(govHolidays.holidayDate);
  },

  async getHolidayOnDate(date: Date) {
    const results = await db.select().from(govHolidays)
      .where(eq(govHolidays.holidayDate, date))
      .limit(1);
    return results[0] || null;
  },

  async createHoliday(data: {
    name: string;
    holidayDate: Date;
    type: 'REGULAR' | 'SPECIAL_NON_WORKING' | 'SPECIAL_WORKING';
    year: string;
  }) {
    const multipliers = {
      REGULAR: { worked: '2.00', unworked: '1.00' },
      SPECIAL_NON_WORKING: { worked: '1.30', unworked: '0.00' },
      SPECIAL_WORKING: { worked: '1.30', unworked: '0.00' },
    };

    const m = multipliers[data.type];
    const id = uuidv4();
    await db.insert(govHolidays).values({
      id,
      name: data.name,
      holidayDate: data.holidayDate,
      type: data.type,
      workedMultiplier: m.worked,
      unworkedMultiplier: m.unworked,
      year: data.year,
    });
    return id;
  },

  async deleteHoliday(id: string) {
    await db.delete(govHolidays).where(eq(govHolidays.id, id));
  },

  async calculateWithholdingTax(taxableIncome: number, frequency: string = 'MONTHLY') {
    if (taxableIncome <= 0) return 0;

    const table = await this.getWtaxTable(frequency);
    if (table.length === 0) return 0;

    // Table is already sorted ASC by rangeStart from the query.
    // Walk forward to find the highest bracket whose rangeStart <= taxableIncome.
    let matchedRow = table[0];
    for (const row of table) {
      if (taxableIncome >= Number(row.rangeStart)) {
        matchedRow = row;
      } else {
        break; // ASC-sorted, no need to check further
      }
    }

    const excess = taxableIncome - Number(matchedRow.rangeStart);
    const tax = Number(matchedRow.baseTax) + (excess * Number(matchedRow.percentageOver));
    return Math.round(tax * 100) / 100;
  }
};
