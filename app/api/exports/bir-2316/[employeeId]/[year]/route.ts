import { NextResponse } from 'next/server';
import { complianceExports } from '@/modules/compliance-exports';
import { hr } from '@/modules/hr';
import { getSessionFromCookie } from '@/modules/auth';

/**
 * GET /api/exports/bir-2316/[employeeId]/[year]
 *
 * Streams a BIR Form 2316 PDF as application/pdf with Content-Disposition
 * attachment. Warnings (missing RDO / DOB / address / no locked pay runs)
 * are surfaced *separately* via the filing-readiness preview server action
 * before the user clicks download — see app/(admin)/exports/bir-picker.tsx.
 * The download response intentionally carries no warning headers because
 * HTTP headers are Latin-1 and warning copy contains em dashes (UTF-8).
 *
 * Mirrors the SSS R-3 route-handler pattern.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ employeeId: string; year: string }> },
) {
  const session = await getSessionFromCookie();
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { employeeId, year } = await params;
  const yearNum = Number(year);
  if (!Number.isInteger(yearNum) || yearNum < 2020 || yearNum > 2099) {
    return new NextResponse('Year must be between 2020 and 2099', { status: 400 });
  }

  const emp = await hr.getEmployee(employeeId);
  if (!emp) {
    return new NextResponse('Employee not found', { status: 404 });
  }

  try {
    const { pdf } = await complianceExports.exportBIR_2316(employeeId, yearNum, {
      actorUserId: session.user.id,
    });

    const safeName = `${emp.employeeCode}`.replace(/[^a-z0-9_-]/gi, '_');
    const filename = `2316-${safeName}-${yearNum}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Export failed: ${message}`, { status: 500 });
  }
}
