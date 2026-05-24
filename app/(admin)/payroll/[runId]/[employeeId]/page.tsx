import Link from 'next/link';
import { notFound } from 'next/navigation';
import { payroll } from '@/modules/payroll';
import { hr } from '@/modules/hr';
import { formatPeso } from '../../peso';

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ runId: string; employeeId: string }>;
}) {
  const { runId, employeeId } = await params;
  const [run, employee, slips] = await Promise.all([
    payroll.getPayRun(runId),
    hr.getEmployee(employeeId),
    payroll.listPayslips({ payRunId: runId, employeeId }),
  ]);
  if (!run || !employee || slips.length === 0) notFound();
  const slip = slips[0]!;

  const totalDeductions =
    Number(slip.sssEE) +
    Number(slip.philhealthEE) +
    Number(slip.pagibigEE) +
    Number(slip.birWtax);

  return (
    <>
      <header className="page-header">
        <div className="breadcrumb">
          <Link href="/payroll" style={{ textDecoration: 'none' }}>Pay runs</Link>{' '}
          ·{' '}
          <Link href={`/payroll/${runId}`} style={{ textDecoration: 'none' }}>
            {run.periodStart} → {run.periodEnd}
          </Link>{' '}
          · {employee.lastName}
        </div>
        <h1 className="page-title">
          {employee.firstName} {employee.lastName}
        </h1>
        <p className="page-sub">
          Payslip for <strong>{run.periodStart} → {run.periodEnd}</strong>. The
          breakdown below shows the four legal deductions and the take-home
          pay.
        </p>
      </header>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
          <div>
            <div className="field-label">Employee code</div>
            <div style={{ marginTop: '0.25rem', fontFamily: 'var(--ff-mono)' }}>{employee.employeeCode}</div>
          </div>
          <div>
            <div className="field-label">Pay schedule</div>
            <div style={{ marginTop: '0.25rem' }}>
              {slip.payFrequencySnapshot === 'SEMI_MONTHLY' ? 'Semi-monthly' : 'Monthly'}
            </div>
          </div>
          <div>
            <div className="field-label">Days worked</div>
            <div style={{ marginTop: '0.25rem', fontFamily: 'var(--ff-mono)' }}>
              {Number(slip.daysWorked).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <div className="section-rule"><h2>Earnings</h2></div>
      <div className="card">
        <Line label="Basic salary (monthly)" value={formatPeso(slip.basicSalarySnapshot)} muted />
        <Line label="Gross pay for this period" value={formatPeso(slip.grossPay)} bold />
      </div>

      <div className="section-rule"><h2>Deductions</h2></div>
      <div className="card">
        <Line label="SSS contribution (employee share)" value={`− ${formatPeso(slip.sssEE)}`} />
        <Line label="PhilHealth contribution (employee share)" value={`− ${formatPeso(slip.philhealthEE)}`} />
        <Line label="Pag-IBIG contribution (employee share)" value={`− ${formatPeso(slip.pagibigEE)}`} />
        <Line label="Withholding tax (BIR)" value={`− ${formatPeso(slip.birWtax)}`} />
        <div style={{ borderTop: '1px solid var(--rule)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
          <Line label="Total deductions" value={`− ${formatPeso(totalDeductions)}`} muted />
        </div>
      </div>

      <div className="section-rule"><h2>Take-home pay</h2></div>
      <div className="card" style={{ background: 'var(--paper-2)', borderColor: 'var(--ochre)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: 'var(--ff-display)', fontSize: '1.125rem', fontWeight: 500, color: 'var(--navy)' }}>
            Net pay
          </div>
          <div
            className="numeric"
            style={{
              fontFamily: 'var(--ff-display)',
              fontSize: '2rem',
              fontWeight: 500,
              color: 'var(--navy)',
              letterSpacing: '-0.015em',
            }}
          >
            {formatPeso(slip.netPay)}
          </div>
        </div>
      </div>

      <p className="footnote">
        Pay run status: <strong>{run.status}</strong>
        {run.lockedAt ? ` · locked ${run.lockedAt.toISOString().slice(0, 10)}` : ''}
      </p>
    </>
  );
}

function Line({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '0.5rem 0',
        color: muted ? 'var(--muted)' : 'var(--ink)',
      }}
    >
      <div>{label}</div>
      <div
        className="numeric"
        style={{ fontWeight: bold ? 600 : 400, fontSize: bold ? '1rem' : '0.9375rem' }}
      >
        {value}
      </div>
    </div>
  );
}
