import Link from 'next/link';
import { notFound } from 'next/navigation';
import { payroll } from '@/modules/payroll';
import { clients } from '@/modules/clients';
import { payrollCalendars } from '@/modules/payroll-calendars';
import { PageShell } from '@/components/page-shell';
import { CountdownBadge } from '@/components/countdown-badge';
import { LockPayRunButton } from './lock-button';
import { formatPeso } from '../peso';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PayRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await payroll.getPayRun(runId);
  if (!run) notFound();

  const [payslips, allClients] = await Promise.all([
    payroll.listPayslipsWithEmployee(runId),
    clients.listClients(),
  ]);

  // Cut-off + payday for the v1 single-client demo — resolve via the first
  // client's calendar. Multi-client per-period dashboard is Slice 3+.
  const today = todayIso();
  const calendarOwner = allClients[0] ?? null;
  const resolved = calendarOwner
    ? await payrollCalendars.resolveForPeriod(
        calendarOwner.id,
        new Date(run.periodStart + 'T00:00:00Z'),
        new Date(run.periodEnd + 'T00:00:00Z'),
      )
    : null;

  const totals = payslips.reduce(
    (acc, p) => ({
      gross: acc.gross + Number(p.grossPay),
      sss: acc.sss + Number(p.sssEE),
      ph: acc.ph + Number(p.philhealthEE),
      pi: acc.pi + Number(p.pagibigEE),
      wtax: acc.wtax + Number(p.birWtax),
      net: acc.net + Number(p.netPay),
    }),
    { gross: 0, sss: 0, ph: 0, pi: 0, wtax: 0, net: 0 },
  );

  const period = `${run.periodStart} → ${run.periodEnd}`;
  const isLocked = run.status === 'locked';

  const toolbar = resolved ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
      <CountdownBadge
        label="Cut-off"
        dueDate={resolved.dtrCutoffDate}
        today={today}
        pastVariant="done"
      />
      <CountdownBadge label="Payday" dueDate={resolved.paydayDate} today={today} />
    </div>
  ) : undefined;

  return (
    <PageShell
      breadcrumb={
        <>
          <Link href="/payroll">Pay runs</Link> · {run.periodStart}
        </>
      }
      title={period}
      description={`${payslips.length} ${payslips.length === 1 ? 'payslip' : 'payslips'} ${isLocked ? 'locked' : 'computed'} for this period. Status: ${run.status}${run.lockedAt ? `, locked on ${run.lockedAt.toISOString().slice(0, 10)}` : ''}.`}
      toolbar={toolbar}
    >

      {payslips.length === 0 ? (
        <div className="empty-state">
          <h3>No payslips for this run</h3>
          <p>
            This pay run was created but produced zero payslips. That usually
            means no employees had DTR entries for the period.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="cell-num">Days</th>
                <th className="cell-num">Gross</th>
                <th className="cell-num">SSS</th>
                <th className="cell-num">PhilHealth</th>
                <th className="cell-num">Pag-IBIG</th>
                <th className="cell-num">Wtax</th>
                <th className="cell-num">Net pay</th>
                <th aria-label="Open"></th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="cell-name">{p.employee.lastName}, {p.employee.firstName}</div>
                    <div className="cell-sub" style={{ fontFamily: 'var(--ff-mono)' }}>{p.employee.employeeCode}</div>
                  </td>
                  <td className="cell-num">{Number(p.daysWorked).toFixed(0)}</td>
                  <td className="cell-num">{formatPeso(p.grossPay)}</td>
                  <td className="cell-num">{formatPeso(p.sssEE)}</td>
                  <td className="cell-num">{formatPeso(p.philhealthEE)}</td>
                  <td className="cell-num">{formatPeso(p.pagibigEE)}</td>
                  <td className="cell-num">{formatPeso(p.birWtax)}</td>
                  <td className="cell-num" style={{ fontWeight: 600 }}>{formatPeso(p.netPay)}</td>
                  <td>
                    <Link
                      href={`/payroll/${runId}/${p.employee.id}`}
                      className="btn btn--ghost"
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--rule-strong)' }}>
                <td style={{ fontWeight: 500 }}>Totals ({payslips.length})</td>
                <td className="cell-num">—</td>
                <td className="cell-num">{formatPeso(totals.gross)}</td>
                <td className="cell-num">{formatPeso(totals.sss)}</td>
                <td className="cell-num">{formatPeso(totals.ph)}</td>
                <td className="cell-num">{formatPeso(totals.pi)}</td>
                <td className="cell-num">{formatPeso(totals.wtax)}</td>
                <td className="cell-num" style={{ fontWeight: 600 }}>{formatPeso(totals.net)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--rule)' }}>
        {isLocked ? (
          <p style={{ color: 'var(--ink-soft)' }}>
            This pay run is locked. Go to{' '}
            <Link href="/exports" style={{ color: 'var(--navy)', textDecoration: 'underline' }}>
              Government exports
            </Link>{' '}
            to download SSS R-3 or BIR 2316.
          </p>
        ) : (
          <LockPayRunButton payRunId={runId} period={period} />
        )}
      </div>
    </PageShell>
  );
}
