import Link from 'next/link';
import { notFound } from 'next/navigation';
import { payroll } from '@/modules/payroll';
import { LockPayRunButton } from './lock-button';
import { formatPeso } from '../peso';

export default async function PayRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await payroll.getPayRun(runId);
  if (!run) notFound();

  const payslips = await payroll.listPayslipsWithEmployee(runId);

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

  return (
    <>
      <header className="page-header">
        <div className="breadcrumb">
          <Link href="/payroll" style={{ textDecoration: 'none' }}>Pay runs</Link> · {run.periodStart}
        </div>
        <h1 className="page-title">{period}</h1>
        <p className="page-sub">
          {payslips.length} {payslips.length === 1 ? 'payslip' : 'payslips'}{' '}
          {isLocked ? 'locked' : 'computed'} for this period. Status:{' '}
          <strong>{run.status}</strong>
          {run.lockedAt
            ? `, locked on ${run.lockedAt.toISOString().slice(0, 10)}`
            : ''}.
        </p>
      </header>

      {payslips.length === 0 ? (
        <div className="empty-state">
          <h3>No payslips for this run</h3>
          <p>
            This pay run was created but produced zero payslips. That usually
            means no guards had DTR entries for the period.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Guard</th>
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
    </>
  );
}
