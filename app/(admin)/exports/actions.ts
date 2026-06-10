'use server';

import { complianceExports } from '@/modules/compliance-exports';
import { getSessionFromCookie } from '@/modules/auth';

export type PreviewWarningsResult =
  | { kind: 'ok'; warnings: string[] }
  | { kind: 'error'; message: string };

/**
 * Pre-computes the BIR 2316 warnings for a (employee, year) pair without
 * generating the PDF. Used by the picker to show the warnings banner upfront
 * so the clerk can fix missing fields (RDO, DOB, address, TIN) before they
 * download — or, if it's filing time and they just need the PDF, at least
 * see what's missing so the filing isn't a surprise.
 */
export async function previewBir2316WarningsAction(
  employeeId: string,
  year: number,
): Promise<PreviewWarningsResult> {
  const session = await getSessionFromCookie();
  if (!session) {
    return { kind: 'error', message: 'Your session expired. Please sign in again.' };
  }

  try {
    const warnings = await complianceExports.previewBir2316Warnings(employeeId, year);
    return { kind: 'ok', warnings };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: 'error', message };
  }
}
