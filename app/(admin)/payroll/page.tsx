import Link from 'next/link';
import { payroll } from '@/modules/payroll';

function statusLabel(s: string): string {
  switch (s) {
    case 'draft': return 'Draft';
    case 'calculated': return 'Calculated';
    case 'locked': return 'Locked';
    default: return s;
  }
}

function statusClass(s: string): string {
  switch (s) {
    case 'locked': return 'is-terminated'; // reuse danger-coloured pill
    case 'calculated': return 'is-hired';   // navy
    case 'draft': return 'is-applicant';     // muted
    default: return 'is-applicant';
  }
}

export default async function PayrollPage() {
  const runs = await payroll.listPayRuns();

  return (
    <>
      <header className="page-header">
        <div className="breadcrumb">Sentinel · Payroll</div>
        <h1 className="page-title">Pay runs</h1>
        <p className="page-sub">
          One row per closed DTR period. Open a pay run to see every guard&rsquo;s
          payslip with the four statutory deductions (SSS, PhilHealth,
          Pag-IBIG, withholding tax). Lock the run when you&rsquo;re ready to
          file government reports.
        </p>
      </header>

      <div className="page-toolbar">
        <div className="page-toolbar-meta">
          {runs.length} pay {runs.length === 1 ? 'run' : 'runs'} on file
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-state">
          <h3>No pay runs yet</h3>
          <p>
            Pay runs are created automatically when you close a DTR period.
            Head over to time records and close a period to see the first one
            here.
          </p>
          <div className="empty-state-actions">
            <Link href="/dtr" className="btn">
              Go to time records →
            </Link>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Status</th>
                <th>Calculated</th>
                <th>Locked</th>
                <th aria-label="Open"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="cell-name">{r.periodStart} → {r.periodEnd}</div>
                  </td>
                  <td>
                    <span className={`status-pill ${statusClass(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="cell-num">
                    {r.calculatedAt
                      ? r.calculatedAt.toISOString().slice(0, 10)
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td className="cell-num">
                    {r.lockedAt
                      ? r.lockedAt.toISOString().slice(0, 10)
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td>
                    <Link href={`/payroll/${r.id}`} className="btn btn--ghost" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}>
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
