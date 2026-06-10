/**
 * bir-2316.ts — exportBIR_2316 service.
 *
 * Phase 7 (Slice 2): replaces the Slice-1 structured-object return with a
 * proper PDF buffer rendered via @react-pdf/renderer.
 *
 * Returns { pdf: Buffer, warnings: string[] } instead of the Slice-1
 * BIR2316Export structured object. Warnings surface missing BIR fields (RDO,
 * DOB, address) and data gaps (no locked pay runs) without blocking PDF
 * generation — the PDF is always returned.
 *
 * Audit action: 'compliance.bir2316.exported'
 */

import { getEmployeeWithIdentity } from '@/modules/hr';
import { audit } from '@/modules/audit';
import { computeYtd } from './ytd';
import { renderBir2316Pdf } from './bir-2316.pdf';

export type Bir2316Result = {
  pdf: Buffer;
  warnings: string[];
};

/**
 * previewBir2316Warnings — Compute the warnings array for a (employee, year)
 * pair WITHOUT rendering the PDF or writing an audit row. Lets the UI show
 * the warnings banner upfront, before the clerk commits to the (expensive)
 * PDF render and audit-logged export.
 *
 * Logic mirrors `exportBIR_2316` exactly — keep them in sync if the warning
 * rules change.
 */
export async function previewBir2316Warnings(
  employeeId: string,
  year: number,
): Promise<string[]> {
  // Identity fields (tinNumber, dateOfBirth, addressLine1) are sourced from
  // the persons table via the accessor; rdoCode remains on hr_employees.
  const emp = await getEmployeeWithIdentity(employeeId);
  if (!emp) {
    throw new Error(`[compliance-exports/bir-2316] Employee not found: ${employeeId}`);
  }

  const ytd = await computeYtd(employeeId, year);
  const warnings: string[] = [];
  if (!emp.rdoCode)      warnings.push('RDO code missing');
  if (!emp.dateOfBirth)  warnings.push('Date of birth missing');
  if (!emp.addressLine1) warnings.push('Address missing');
  if (!emp.tinNumber)    warnings.push(`employee ${emp.employeeCode} has no TIN on file — required for BIR 2316`);
  if (ytd.payRunCount === 0) {
    warnings.push(`No locked pay runs for ${year} — PDF generated with zero values`);
  }
  return warnings;
}

/**
 * exportBIR_2316 — Render a PDF BIR Form 2316 for one employee × one
 * calendar year.
 *
 * Aggregates YTD totals from LOCKED pay runs only (draft / calculated runs
 * are excluded). Missing BIR fields (RDO code, date of birth, address)
 * surface as warnings but do not block the export — the PDF renders with
 * blank boxes for those fields.
 *
 * Zero-value aggregate (no locked runs) also produces a valid PDF so
 * downstream callers always receive a Buffer regardless of data completeness.
 */
export async function exportBIR_2316(
  employeeId: string,
  year: number,
  opts: { actorUserId?: string | null } = {},
): Promise<Bir2316Result> {
  // ── 1. Resolve employee ──────────────────────────────────────────────────
  // Identity fields (tinNumber, dateOfBirth, addressLine1, etc.) are sourced
  // from the persons table via the accessor; rdoCode remains on hr_employees.
  const emp = await getEmployeeWithIdentity(employeeId);
  if (!emp) {
    throw new Error(`[compliance-exports/bir-2316] Employee not found: ${employeeId}`);
  }

  // ── 2. Compute YTD from locked pay runs only ─────────────────────────────
  const ytd = await computeYtd(employeeId, year);

  // ── 3. Build warnings (non-blocking) ─────────────────────────────────────
  const warnings: string[] = [];

  if (!emp.rdoCode)      warnings.push('RDO code missing');
  if (!emp.dateOfBirth)  warnings.push('Date of birth missing');
  if (!emp.addressLine1) warnings.push('Address missing');
  if (!emp.tinNumber)    warnings.push(`employee ${emp.employeeCode} has no TIN on file — required for BIR 2316`);

  if (ytd.payRunCount === 0) {
    warnings.push(`No locked pay runs for ${year} — PDF generated with zero values`);
  }

  // ── 4. Render PDF ────────────────────────────────────────────────────────
  const pdf = await renderBir2316Pdf(emp, ytd, year);

  // ── 5. Audit ─────────────────────────────────────────────────────────────
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'compliance.bir2316.exported',
    target: { kind: 'hr_employee', id: emp.id },
    payload: {
      year,
      employeeCode: emp.employeeCode,
      ytdGross: ytd.gross,
      payRunCount: ytd.payRunCount,
      warningCount: warnings.length,
    },
  });

  return { pdf, warnings };
}

// ── Legacy type alias for downstream consumers still importing BIR2316Export.
// Phase 8 UI will use Bir2316Result directly.
export type { Bir2316Result as BIR2316Export };
