import { NextResponse } from 'next/server';
import { complianceExports } from '@/modules/compliance-exports';
import { hr } from '@/modules/hr';
import { getSessionFromCookie } from '@/modules/auth';

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
    return new NextResponse('Guard not found', { status: 404 });
  }

  try {
    const result = await complianceExports.exportBIR_2316(employeeId, yearNum, {
      actorUserId: session.user.id,
    });
    const safeName = `${emp.lastName}_${emp.firstName}`.replace(/[^a-z0-9_-]/gi, '_');
    const filename = `bir-2316_${safeName}_${yearNum}.json`;
    return new NextResponse(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Export failed: ${message}`, { status: 500 });
  }
}
