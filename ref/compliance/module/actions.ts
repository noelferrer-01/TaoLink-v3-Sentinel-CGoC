"use server";

import { db } from "@/db";
import { govPhilhealthConfig, govPagibigConfig, govSssContributionTable, govWtaxTable } from "./schema";
import { v4 as uuidv4 } from "uuid";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth-utils";
import { safeErrorMessage } from "@/lib/safe-error";
import { eq, and, desc, sql } from "drizzle-orm";
import { AuditService } from "@/modules/audit/service";
import { ComplianceService } from "./service";

type ActionState = { error?: string; success?: boolean; message?: string } | null;

export async function updatePhilhealthAction(prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);

    const rateRaw    = parseFloat(formData.get("rate") as string);
    const floorRaw   = parseFloat(formData.get("floor") as string);
    const ceilingRaw = parseFloat(formData.get("ceiling") as string);
    const effectiveDate = (formData.get("effectiveDate") as string)?.trim();

    if (isNaN(rateRaw) || isNaN(floorRaw) || isNaN(ceilingRaw) || !effectiveDate) {
      return { error: "All fields are required." };
    }
    if (rateRaw <= 0 || rateRaw >= 1) {
      return { error: "Rate must be between 0 and 1 (e.g. enter 0.05 for 5%)." };
    }
    if (floorRaw <= 0 || ceilingRaw <= 0) {
      return { error: "Floor and ceiling must be positive amounts." };
    }
    if (floorRaw >= ceilingRaw) {
      return { error: "Floor must be less than ceiling." };
    }

    // H-4: Prevent duplicate effectiveDate — two rows with the same date cause undefined
    // behavior in the two-step pre-fetch (ties broken by createdAt, same-second inserts non-deterministic).
    const existingPh = await db.select({ id: govPhilhealthConfig.id })
      .from(govPhilhealthConfig)
      .where(eq(govPhilhealthConfig.effectiveDate, new Date(effectiveDate + "T00:00:00")))
      .limit(1);
    if (existingPh.length > 0) {
      return { error: `A PhilHealth rate with effective date ${effectiveDate} already exists. Choose a different date.` };
    }

    const newId = uuidv4();
    await db.insert(govPhilhealthConfig).values({
      id: newId,
      rate: rateRaw.toFixed(4),
      floor: floorRaw.toFixed(2),
      ceiling: ceilingRaw.toFixed(2),
      effectiveDate: new Date(effectiveDate + "T00:00:00"),
    });

    // M-8: Audit log for compliance rate changes — required for BIR audit trail.
    await AuditService.log({
      userId: user.id,
      action: 'UPDATE_COMPLIANCE_RATE',
      entity: 'gov_philhealth_config',
      entityId: newId,
      changes: JSON.stringify({ rate: rateRaw, floor: floorRaw, ceiling: ceilingRaw, effectiveDate }),
    }).catch(() => { /* non-fatal */ });

    revalidatePath("/settings/government-rates");
    return { success: true, message: `PhilHealth rates updated effective ${effectiveDate}.` };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

export async function updatePagibigAction(prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);

    const eeRateRaw  = parseFloat(formData.get("eeRate") as string);
    const erRateRaw  = parseFloat(formData.get("erRate") as string);
    const salaryCapRaw = parseFloat(formData.get("salaryCap") as string);
    const effectiveDate = (formData.get("effectiveDate") as string)?.trim();

    if (isNaN(eeRateRaw) || isNaN(erRateRaw) || isNaN(salaryCapRaw) || !effectiveDate) {
      return { error: "All fields are required." };
    }
    if (eeRateRaw <= 0 || eeRateRaw >= 1 || erRateRaw <= 0 || erRateRaw >= 1) {
      return { error: "Rates must be between 0 and 1 (e.g. enter 0.02 for 2%)." };
    }
    if (salaryCapRaw <= 0) {
      return { error: "Salary cap must be a positive amount." };
    }

    // H-4: Prevent duplicate effectiveDate.
    const existingPi = await db.select({ id: govPagibigConfig.id })
      .from(govPagibigConfig)
      .where(eq(govPagibigConfig.effectiveDate, new Date(effectiveDate + "T00:00:00")))
      .limit(1);
    if (existingPi.length > 0) {
      return { error: `A Pag-IBIG rate with effective date ${effectiveDate} already exists. Choose a different date.` };
    }

    const newPiId = uuidv4();
    await db.insert(govPagibigConfig).values({
      id: newPiId,
      eeRate: eeRateRaw.toFixed(4),
      erRate: erRateRaw.toFixed(4),
      salaryCap: salaryCapRaw.toFixed(2),
      effectiveDate: new Date(effectiveDate + "T00:00:00"),
    });

    // M-8: Audit log for compliance rate changes.
    await AuditService.log({
      userId: user.id,
      action: 'UPDATE_COMPLIANCE_RATE',
      entity: 'gov_pagibig_config',
      entityId: newPiId,
      changes: JSON.stringify({ eeRate: eeRateRaw, erRate: erRateRaw, salaryCap: salaryCapRaw, effectiveDate }),
    }).catch(() => { /* non-fatal */ });

    revalidatePath("/settings/government-rates");
    return { success: true, message: `Pag-IBIG rates updated effective ${effectiveDate}.` };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

// ── SSS Bracket Actions ─────────────────────────────────────────────────

export async function cloneSssScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);
    const newDate = (formData.get("effectiveDate") as string)?.trim();
    if (!newDate) return { error: "Effective date is required." };

    // Prevent duplicate
    const existing = await db.select({ id: govSssContributionTable.id })
      .from(govSssContributionTable)
      .where(eq(govSssContributionTable.effectiveDate, new Date(newDate + "T00:00:00")))
      .limit(1);
    if (existing.length > 0) return { error: `An SSS schedule for ${newDate} already exists.` };

    // Get current (latest) schedule
    const current = await ComplianceService.getSssTable();
    if (current.length === 0) return { error: "No existing SSS schedule to clone from." };

    // Clone all brackets with the new effective date
    for (const row of current) {
      await db.insert(govSssContributionTable).values({
        id: uuidv4(),
        rangeStart: row.rangeStart,
        rangeEnd: row.rangeEnd,
        monthlySalaryCredit: row.monthlySalaryCredit,
        eeShareRegular: row.eeShareRegular,
        erShareRegular: row.erShareRegular,
        eeShareWisp: row.eeShareWisp,
        erShareWisp: row.erShareWisp,
        effectiveDate: new Date(newDate + "T00:00:00"),
      });
    }

    await AuditService.log({
      userId: user.id,
      action: 'CLONE_SSS_SCHEDULE',
      entity: 'gov_sss_contribution_table',
      entityId: newDate,
      changes: JSON.stringify({ bracketCount: current.length, effectiveDate: newDate }),
    }).catch(() => {});

    revalidatePath("/settings/government-rates");
    return { success: true, message: `Cloned ${current.length} SSS brackets to effective date ${newDate}. You can now edit individual rows.` };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

export async function updateSssBracketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);
    const id = (formData.get("id") as string)?.trim();
    if (!id) return { error: "Bracket ID is required." };

    const rangeStart = parseFloat(formData.get("rangeStart") as string);
    const rangeEnd = parseFloat(formData.get("rangeEnd") as string);
    const msc = parseFloat(formData.get("msc") as string);
    const eeRegular = parseFloat(formData.get("eeShareRegular") as string);
    const erRegular = parseFloat(formData.get("erShareRegular") as string);
    const eeWisp = parseFloat(formData.get("eeShareWisp") as string || "0");
    const erWisp = parseFloat(formData.get("erShareWisp") as string || "0");

    if ([rangeStart, msc, eeRegular, erRegular].some(isNaN)) {
      return { error: "Range start, MSC, EE Share, and ER Share are required." };
    }

    await db.update(govSssContributionTable)
      .set({
        rangeStart: rangeStart.toFixed(2),
        rangeEnd: (isNaN(rangeEnd) ? 0 : rangeEnd).toFixed(2),
        monthlySalaryCredit: msc.toFixed(2),
        eeShareRegular: eeRegular.toFixed(2),
        erShareRegular: erRegular.toFixed(2),
        eeShareWisp: (isNaN(eeWisp) ? 0 : eeWisp).toFixed(2),
        erShareWisp: (isNaN(erWisp) ? 0 : erWisp).toFixed(2),
      })
      .where(eq(govSssContributionTable.id, id));

    await AuditService.log({
      userId: user.id,
      action: 'UPDATE_SSS_BRACKET',
      entity: 'gov_sss_contribution_table',
      entityId: id,
      changes: JSON.stringify({ rangeStart, rangeEnd, msc, eeRegular, erRegular, eeWisp, erWisp }),
    }).catch(() => {});

    revalidatePath("/settings/government-rates");
    return { success: true, message: "SSS bracket updated." };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

export async function deleteSssBracketAction(id: string): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);
    await db.delete(govSssContributionTable).where(eq(govSssContributionTable.id, id));
    await AuditService.log({
      userId: user.id,
      action: 'DELETE_SSS_BRACKET',
      entity: 'gov_sss_contribution_table',
      entityId: id,
      changes: '{}',
    }).catch(() => {});
    revalidatePath("/settings/government-rates");
    return { success: true, message: "SSS bracket deleted." };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

export async function addSssBracketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);
    const effectiveDate = (formData.get("effectiveDate") as string)?.trim();
    if (!effectiveDate) return { error: "Effective date is required." };

    const rangeStart = parseFloat(formData.get("rangeStart") as string);
    const rangeEnd = parseFloat(formData.get("rangeEnd") as string);
    const msc = parseFloat(formData.get("msc") as string);
    const eeRegular = parseFloat(formData.get("eeShareRegular") as string);
    const erRegular = parseFloat(formData.get("erShareRegular") as string);
    const eeWisp = parseFloat(formData.get("eeShareWisp") as string || "0");
    const erWisp = parseFloat(formData.get("erShareWisp") as string || "0");

    if ([rangeStart, msc, eeRegular, erRegular].some(isNaN)) {
      return { error: "Range start, MSC, EE Share, and ER Share are required." };
    }

    const newId = uuidv4();
    await db.insert(govSssContributionTable).values({
      id: newId,
      rangeStart: rangeStart.toFixed(2),
      rangeEnd: (isNaN(rangeEnd) ? 0 : rangeEnd).toFixed(2),
      monthlySalaryCredit: msc.toFixed(2),
      eeShareRegular: eeRegular.toFixed(2),
      erShareRegular: erRegular.toFixed(2),
      eeShareWisp: (isNaN(eeWisp) ? 0 : eeWisp).toFixed(2),
      erShareWisp: (isNaN(erWisp) ? 0 : erWisp).toFixed(2),
      effectiveDate: new Date(effectiveDate + "T00:00:00"),
    });

    await AuditService.log({
      userId: user.id,
      action: 'ADD_SSS_BRACKET',
      entity: 'gov_sss_contribution_table',
      entityId: newId,
      changes: JSON.stringify({ rangeStart, rangeEnd, msc, eeRegular, erRegular, effectiveDate }),
    }).catch(() => {});

    revalidatePath("/settings/government-rates");
    return { success: true, message: "SSS bracket added." };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

// ── W-Tax Bracket Actions ────────────────────────────────────────────────

export async function cloneWtaxScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);
    const newDate = (formData.get("effectiveDate") as string)?.trim();
    if (!newDate) return { error: "Effective date is required." };

    // Prevent duplicate
    const existing = await db.select({ id: govWtaxTable.id })
      .from(govWtaxTable)
      .where(eq(govWtaxTable.effectiveDate, new Date(newDate + "T00:00:00")))
      .limit(1);
    if (existing.length > 0) return { error: `A W-Tax schedule for ${newDate} already exists.` };

    // Get current (latest) schedules — clone both MONTHLY and SEMI_MONTHLY
    const monthly = await ComplianceService.getWtaxTable('MONTHLY');
    const semiMonthly = await ComplianceService.getWtaxTable('SEMI_MONTHLY');
    const allRows = [...monthly, ...semiMonthly];
    if (allRows.length === 0) return { error: "No existing W-Tax schedule to clone from." };

    for (const row of allRows) {
      await db.insert(govWtaxTable).values({
        id: uuidv4(),
        frequency: row.frequency,
        rangeStart: row.rangeStart,
        rangeEnd: row.rangeEnd,
        baseTax: row.baseTax,
        percentageOver: row.percentageOver,
        effectiveDate: new Date(newDate + "T00:00:00"),
      });
    }

    await AuditService.log({
      userId: user.id,
      action: 'CLONE_WTAX_SCHEDULE',
      entity: 'gov_wtax_table',
      entityId: newDate,
      changes: JSON.stringify({ bracketCount: allRows.length, effectiveDate: newDate }),
    }).catch(() => {});

    revalidatePath("/settings/government-rates");
    return { success: true, message: `Cloned ${allRows.length} W-Tax brackets to effective date ${newDate}.` };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

export async function updateWtaxBracketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);
    const id = (formData.get("id") as string)?.trim();
    if (!id) return { error: "Bracket ID is required." };

    const rangeStart = parseFloat(formData.get("rangeStart") as string);
    const rangeEndRaw = formData.get("rangeEnd") as string;
    const rangeEnd = rangeEndRaw ? parseFloat(rangeEndRaw) : null;
    const baseTax = parseFloat(formData.get("baseTax") as string);
    const percentageOver = parseFloat(formData.get("percentageOver") as string);

    if ([rangeStart, baseTax, percentageOver].some(isNaN)) {
      return { error: "Range start, base tax, and percentage over are required." };
    }

    await db.update(govWtaxTable)
      .set({
        rangeStart: rangeStart.toFixed(2),
        rangeEnd: rangeEnd !== null && !isNaN(rangeEnd) ? rangeEnd.toFixed(2) : null,
        baseTax: baseTax.toFixed(2),
        percentageOver: percentageOver.toFixed(4),
      })
      .where(eq(govWtaxTable.id, id));

    await AuditService.log({
      userId: user.id,
      action: 'UPDATE_WTAX_BRACKET',
      entity: 'gov_wtax_table',
      entityId: id,
      changes: JSON.stringify({ rangeStart, rangeEnd, baseTax, percentageOver }),
    }).catch(() => {});

    revalidatePath("/settings/government-rates");
    return { success: true, message: "W-Tax bracket updated." };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

export async function deleteWtaxBracketAction(id: string): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);
    await db.delete(govWtaxTable).where(eq(govWtaxTable.id, id));
    await AuditService.log({
      userId: user.id,
      action: 'DELETE_WTAX_BRACKET',
      entity: 'gov_wtax_table',
      entityId: id,
      changes: '{}',
    }).catch(() => {});
    revalidatePath("/settings/government-rates");
    return { success: true, message: "W-Tax bracket deleted." };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}

export async function addWtaxBracketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole(['SUPER_ADMIN']);
    const effectiveDate = (formData.get("effectiveDate") as string)?.trim();
    const frequency = (formData.get("frequency") as string)?.trim() || 'MONTHLY';
    if (!effectiveDate) return { error: "Effective date is required." };

    const rangeStart = parseFloat(formData.get("rangeStart") as string);
    const rangeEndRaw = formData.get("rangeEnd") as string;
    const rangeEnd = rangeEndRaw ? parseFloat(rangeEndRaw) : null;
    const baseTax = parseFloat(formData.get("baseTax") as string);
    const percentageOver = parseFloat(formData.get("percentageOver") as string);

    if ([rangeStart, baseTax, percentageOver].some(isNaN)) {
      return { error: "Range start, base tax, and percentage over are required." };
    }

    const newId = uuidv4();
    await db.insert(govWtaxTable).values({
      id: newId,
      frequency,
      rangeStart: rangeStart.toFixed(2),
      rangeEnd: rangeEnd !== null && !isNaN(rangeEnd) ? rangeEnd.toFixed(2) : null,
      baseTax: baseTax.toFixed(2),
      percentageOver: percentageOver.toFixed(4),
      effectiveDate: new Date(effectiveDate + "T00:00:00"),
    });

    await AuditService.log({
      userId: user.id,
      action: 'ADD_WTAX_BRACKET',
      entity: 'gov_wtax_table',
      entityId: newId,
      changes: JSON.stringify({ rangeStart, rangeEnd, baseTax, percentageOver, frequency, effectiveDate }),
    }).catch(() => {});

    revalidatePath("/settings/government-rates");
    return { success: true, message: "W-Tax bracket added." };
  } catch (error) {
    return { error: safeErrorMessage(error) };
  }
}
