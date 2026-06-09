import { payroll } from '@/modules/payroll';
import { hr } from '@/modules/hr';
import { PageShell } from '@/components/page-shell';
import { SssPicker } from './sss-picker';
import { BirPicker } from './bir-picker';

export default async function ExportsPage() {
  const [runs, guards] = await Promise.all([
    payroll.listPayRuns(),
    hr.listEmployees(),
  ]);

  const runOptions = runs.map((r) => ({
    id: r.id,
    label: `${r.periodStart} → ${r.periodEnd}`,
    status: r.status,
  }));

  // T9: firstName/lastName now come from the linked Person via listEmployees.
  const guardOptions = guards.map((g) => ({
    id: g.id,
    label: `${g.lastName ?? g.employeeCode}, ${g.firstName ?? ''} (${g.employeeCode})`,
  }));

  const currentYear = new Date().getFullYear();

  return (
    <PageShell
      breadcrumb={<>Sentinel · Payroll · Government exports</>}
      title="Government exports"
      description="Generate the legally-required reports filed with SSS, BIR, PhilHealth, and Pag-IBIG. Sentinel pulls the numbers straight from your locked pay runs — no manual re-keying."
      footerHint="Fix warnings before filing — the PDF still downloads with blank fields if any are missing, but BIR rejects incomplete forms at submission."
    >
      <div className="section-rule"><h2>SSS R-3 (Contribution Collection List)</h2></div>
      <p style={{ color: 'var(--ink-soft)', marginBottom: '1.5rem', maxWidth: '60ch' }}>
        Filed per pay run. The CSV matches the BIR-prescribed column order so
        SSS&rsquo;s online portal accepts the upload without errors.
      </p>
      <div className="card" style={{ marginBottom: '2.5rem' }}>
        <SssPicker runs={runOptions} />
      </div>

      <div className="section-rule"><h2>BIR Form 2316 (Annual Compensation Tax Certificate)</h2></div>
      <p style={{ color: 'var(--ink-soft)', marginBottom: '1.5rem', maxWidth: '60ch' }}>
        Filed once a year per employee. Sentinel sums every locked payslip
        within the calendar year to compute total compensation and
        withholding.
      </p>
      <div className="card">
        <BirPicker employees={guardOptions} defaultYear={currentYear} />
      </div>

      <p className="footnote">
        Other reports coming in later slices: PhilHealth RF-1, Pag-IBIG M1-1,
        SSS R-3 quarterly aggregator, bulk BIR 2316 ZIP.
      </p>
    </PageShell>
  );
}
