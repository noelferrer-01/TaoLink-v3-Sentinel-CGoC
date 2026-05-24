import { NextResponse } from 'next/server';
import { complianceExports } from '@/modules/compliance-exports';
import { payroll } from '@/modules/payroll';
import { getSessionFromCookie } from '@/modules/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const session = await getSessionFromCookie();
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { runId } = await params;
  const run = await payroll.getPayRun(runId);
  if (!run) {
    return new NextResponse('Pay run not found', { status: 404 });
  }

  try {
    const result = await complianceExports.exportSSS_R3(runId, {
      actorUserId: session.user.id,
    });
    const filename = `sss-r3_${run.periodStart}_to_${run.periodEnd}.csv`;
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-SSS-R3-Rows': String(result.rows),
        'X-SSS-R3-Warnings': String(result.warnings.length),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Export failed: ${message}`, { status: 500 });
  }
}
