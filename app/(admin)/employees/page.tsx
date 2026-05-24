import Link from 'next/link';
import { hr, type EmployeeListItem } from '@/modules/hr';

const PESO = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPeso(amount: string): string {
  return PESO.format(Number(amount));
}

function statusLabel(s: EmployeeListItem['status']): string {
  switch (s) {
    case 'on_leave': return 'On leave';
    default: return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

function payFreqLabel(f: EmployeeListItem['payFrequency']): string {
  return f === 'SEMI_MONTHLY' ? 'Semi-monthly' : 'Monthly';
}

export default async function EmployeesPage() {
  const guards = await hr.listEmployees();

  return (
    <>
      <header className="page-header">
        <div className="breadcrumb">Sentinel · Operations</div>
        <h1 className="page-title">Guards</h1>
        <p className="page-sub">
          Everyone on your roster &mdash; applicants, hired guards, and those
          currently deployed. Import a CSV to add many at once, or you can also
          add them one at a time.
        </p>
      </header>

      <div className="page-toolbar">
        <div className="page-toolbar-meta">
          {guards.length} {guards.length === 1 ? 'guard' : 'guards'} on file
        </div>
        <div className="page-toolbar-actions">
          <Link href="/employees/import" className="btn">
            Import a CSV →
          </Link>
        </div>
      </div>

      {guards.length === 0 ? (
        <div className="empty-state">
          <h3>No guards yet</h3>
          <p>
            Import a CSV to get started. Sentinel will check every row and tell
            you exactly what to fix before importing.
          </p>
          <div className="empty-state-actions">
            <Link href="/employees/import" className="btn">
              Import a CSV →
            </Link>
            <Link href="/hr-employees-sample.csv" className="btn btn--ghost" download>
              Download sample CSV
            </Link>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Guard</th>
                <th>Code</th>
                <th>Status</th>
                <th>Pay schedule</th>
                <th className="cell-num">Monthly rate</th>
                <th>Hired</th>
              </tr>
            </thead>
            <tbody>
              {guards.map((g) => (
                <tr key={g.id}>
                  <td>
                    <div className="cell-name">
                      {g.lastName}, {g.firstName}
                    </div>
                    {g.email ? <div className="cell-sub">{g.email}</div> : null}
                  </td>
                  <td className="cell-sub" style={{ fontFamily: 'var(--ff-mono)' }}>
                    {g.employeeCode}
                  </td>
                  <td>
                    <span className={`status-pill is-${g.status}`}>
                      {statusLabel(g.status)}
                    </span>
                  </td>
                  <td>{payFreqLabel(g.payFrequency)}</td>
                  <td className="cell-num">{formatPeso(g.basicSalary)}</td>
                  <td className="cell-num">{g.hiredOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
