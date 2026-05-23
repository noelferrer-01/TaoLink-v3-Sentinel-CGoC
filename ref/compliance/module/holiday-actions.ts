"use server";

import { db } from "@/db";
import { govHolidays } from "./holiday-schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth-utils";
import { safeErrorMessage } from "@/lib/safe-error";

type ActionState = { error?: string; success?: boolean; message?: string } | null;

// Multipliers are fixed by the Labor Code — HR does not set these manually
const TYPE_MULTIPLIERS = {
  REGULAR:             { worked: '2.00', unworked: '1.00' },
  SPECIAL_NON_WORKING: { worked: '1.30', unworked: '0.00' },
  SPECIAL_WORKING:     { worked: '1.30', unworked: '0.00' },
} as const;

export async function addHolidayAction(prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireRole(['SUPER_ADMIN', 'HR_ADMIN']);

    const name = (formData.get("name") as string)?.trim().slice(0, 150);
    const holidayDate = formData.get("holidayDate") as string;
    const type = formData.get("type") as keyof typeof TYPE_MULTIPLIERS;

    if (!name || !holidayDate || !type || !TYPE_MULTIPLIERS[type]) {
      return { error: "All fields are required." };
    }

    const date = new Date(holidayDate);
    if (isNaN(date.getTime())) return { error: "Invalid date." };

    const year = date.getFullYear().toString();
    const m = TYPE_MULTIPLIERS[type];

    await db.insert(govHolidays).values({
      id: uuidv4(),
      name,
      holidayDate: date,
      type,
      workedMultiplier: m.worked,
      unworkedMultiplier: m.unworked,
      year,
    });

    revalidatePath("/settings/holidays");
    return { success: true };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

export async function deleteHolidayAction(prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireRole(['SUPER_ADMIN', 'HR_ADMIN']);

    const id = formData.get("id") as string;
    if (!id) return { error: "Invalid ID." };

    await db.delete(govHolidays).where(eq(govHolidays.id, id));

    revalidatePath("/settings/holidays");
    return { success: true };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

// Official PH proclaimed holidays per year.
// Islamic holidays (Eid) are approximate — update when the exact IATF proclamation is issued.
// Note: "rest day" premiums (Regular Holiday on rest day = 260%, Special NW on rest day = 150%)
// are calculated automatically by the payroll engine from isRestDay + holiday type.
// There is no "triple pay" holiday type — it's a derived result, not a configurable type.
const OFFICIAL_PH_HOLIDAYS: Record<string, Array<{
  name: string;
  date: string;
  type: keyof typeof TYPE_MULTIPLIERS;
}>> = {
  '2025': [
    { name: "New Year's Day",                        date: '2025-01-01', type: 'REGULAR' },
    { name: 'Chinese New Year',                      date: '2025-01-29', type: 'SPECIAL_NON_WORKING' },
    { name: 'EDSA People Power Anniversary',         date: '2025-02-25', type: 'SPECIAL_NON_WORKING' },
    { name: 'Eid al-Fitr (approx.)',                 date: '2025-03-31', type: 'REGULAR' },
    { name: 'Araw ng Kagitingan (Day of Valor)',     date: '2025-04-09', type: 'REGULAR' },
    { name: 'Maundy Thursday',                       date: '2025-04-17', type: 'REGULAR' },
    { name: 'Good Friday',                           date: '2025-04-18', type: 'REGULAR' },
    { name: 'Black Saturday',                        date: '2025-04-19', type: 'SPECIAL_NON_WORKING' },
    { name: 'Labor Day',                             date: '2025-05-01', type: 'REGULAR' },
    { name: 'Eid al-Adha (approx.)',                 date: '2025-06-07', type: 'REGULAR' },
    { name: 'Independence Day',                      date: '2025-06-12', type: 'REGULAR' },
    { name: 'Ninoy Aquino Day',                      date: '2025-08-21', type: 'SPECIAL_NON_WORKING' },
    { name: 'National Heroes Day',                   date: '2025-08-25', type: 'REGULAR' },
    { name: "All Saints' Day",                       date: '2025-11-01', type: 'SPECIAL_NON_WORKING' },
    { name: 'Bonifacio Day',                         date: '2025-11-30', type: 'REGULAR' },
    { name: 'Feast of the Immaculate Conception',    date: '2025-12-08', type: 'SPECIAL_NON_WORKING' },
    { name: 'Christmas Day',                         date: '2025-12-25', type: 'REGULAR' },
    { name: 'Rizal Day',                             date: '2025-12-30', type: 'REGULAR' },
    { name: 'Last Day of the Year',                  date: '2025-12-31', type: 'SPECIAL_NON_WORKING' },
  ],
  '2026': [
    { name: "New Year's Day",                        date: '2026-01-01', type: 'REGULAR' },
    { name: 'Chinese New Year',                      date: '2026-02-17', type: 'SPECIAL_NON_WORKING' },
    { name: 'EDSA People Power Anniversary',         date: '2026-02-25', type: 'SPECIAL_NON_WORKING' },
    { name: 'Eid al-Fitr (approx.)',                 date: '2026-03-20', type: 'REGULAR' },
    { name: 'Maundy Thursday',                       date: '2026-04-02', type: 'REGULAR' },
    { name: 'Good Friday',                           date: '2026-04-03', type: 'REGULAR' },
    { name: 'Black Saturday',                        date: '2026-04-04', type: 'SPECIAL_NON_WORKING' },
    { name: 'Araw ng Kagitingan (Day of Valor)',     date: '2026-04-09', type: 'REGULAR' },
    { name: 'Labor Day',                             date: '2026-05-01', type: 'REGULAR' },
    { name: 'Eid al-Adha (approx.)',                 date: '2026-05-27', type: 'REGULAR' },
    { name: 'Independence Day',                      date: '2026-06-12', type: 'REGULAR' },
    { name: 'Ninoy Aquino Day',                      date: '2026-08-21', type: 'SPECIAL_NON_WORKING' },
    { name: 'National Heroes Day',                   date: '2026-08-31', type: 'REGULAR' },
    { name: "All Saints' Day",                       date: '2026-11-01', type: 'SPECIAL_NON_WORKING' },
    { name: 'Bonifacio Day',                         date: '2026-11-30', type: 'REGULAR' },
    { name: 'Feast of the Immaculate Conception',    date: '2026-12-08', type: 'SPECIAL_NON_WORKING' },
    { name: 'Christmas Day',                         date: '2026-12-25', type: 'REGULAR' },
    { name: 'Rizal Day',                             date: '2026-12-30', type: 'REGULAR' },
    { name: 'Last Day of the Year',                  date: '2026-12-31', type: 'SPECIAL_NON_WORKING' },
  ],
  '2027': [
    // Moveable dates — update these when IATF/proclamation is issued for 2027
    { name: "New Year's Day",                        date: '2027-01-01', type: 'REGULAR' },
    { name: 'EDSA People Power Anniversary',         date: '2027-02-25', type: 'SPECIAL_NON_WORKING' },
    { name: 'Araw ng Kagitingan (Day of Valor)',     date: '2027-04-09', type: 'REGULAR' },
    { name: 'Labor Day',                             date: '2027-05-01', type: 'REGULAR' },
    { name: 'Independence Day',                      date: '2027-06-12', type: 'REGULAR' },
    { name: 'Ninoy Aquino Day',                      date: '2027-08-21', type: 'SPECIAL_NON_WORKING' },
    { name: "All Saints' Day",                       date: '2027-11-01', type: 'SPECIAL_NON_WORKING' },
    { name: 'Bonifacio Day',                         date: '2027-11-30', type: 'REGULAR' },
    { name: 'Feast of the Immaculate Conception',    date: '2027-12-08', type: 'SPECIAL_NON_WORKING' },
    { name: 'Christmas Day',                         date: '2027-12-25', type: 'REGULAR' },
    { name: 'Rizal Day',                             date: '2027-12-30', type: 'REGULAR' },
    { name: 'Last Day of the Year',                  date: '2027-12-31', type: 'SPECIAL_NON_WORKING' },
  ],
};

export async function loadOfficialHolidaysAction(prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireRole(['SUPER_ADMIN', 'HR_ADMIN']);

    const year = (formData.get("year") as string)?.trim();
    const holidays = OFFICIAL_PH_HOLIDAYS[year];

    if (!holidays) {
      return { error: `No official holiday data available for ${year}. Add holidays manually or wait for the proclamation.` };
    }

    // Fetch existing dates for this year to skip duplicates
    const existing = await db
      .select({ holidayDate: govHolidays.holidayDate })
      .from(govHolidays)
      .where(eq(govHolidays.year, year));

    // Drizzle MySQL returns date columns as strings ('YYYY-MM-DD')
    const existingDates = new Set(
      existing.map(h => {
        const d = typeof h.holidayDate === 'string' ? h.holidayDate : (h.holidayDate as Date).toISOString().split('T')[0];
        return d.slice(0, 10);
      })
    );

    let added = 0;
    let skipped = 0;

    for (const h of holidays) {
      if (existingDates.has(h.date)) {
        skipped++;
        continue;
      }
      const m = TYPE_MULTIPLIERS[h.type];
      await db.insert(govHolidays).values({
        id: uuidv4(),
        name: h.name,
        holidayDate: new Date(h.date),
        type: h.type,
        workedMultiplier: m.worked,
        unworkedMultiplier: m.unworked,
        year,
      });
      added++;
    }

    revalidatePath("/settings/holidays");

    if (added === 0) {
      return { success: true, message: `All ${skipped} official PH holidays for ${year} are already loaded.` };
    }
    const note = skipped > 0 ? ` (${skipped} already existed, skipped)` : '';
    return { success: true, message: `Loaded ${added} official PH holidays for ${year}.${note}` };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}
