import Link from 'next/link';
import { getSessionFromCookie } from '@/modules/auth';

export default async function DashboardPage() {
  const session = await getSessionFromCookie();
  const email = session?.user.email ?? 'admin';

  return (
    <>
      <header className="page-header">
        <div className="breadcrumb">Sentinel · Operations</div>
        <h1 className="page-title">Welcome back.</h1>
        <p className="page-sub">
          You&rsquo;re signed in as <strong>{email}</strong>. Here are the three
          things to set up first to get your agency running on Sentinel.
        </p>
      </header>

      <div className="section-rule">
        <h2>Set up your agency</h2>
      </div>

      <ol className="steps">
        <li className="step">
          <div className="step-number">01</div>
          <div className="step-body">
            <h3>Add your first client</h3>
            <p>
              Clients are the companies that pay for guard services. You&rsquo;ll
              create at least one client (and one detachment) before you can
              assign guards.
            </p>
          </div>
          <div className="step-cta">
            <Link href="/clients" className="btn btn--ghost">
              Add a client →
            </Link>
          </div>
        </li>

        <li className="step">
          <div className="step-number">02</div>
          <div className="step-body">
            <h3>Import your guards</h3>
            <p>
              Upload a CSV with each guard&rsquo;s name, monthly rate, hire
              date, and pay schedule. Sentinel checks every row and tells you
              exactly what to fix before importing anything.
            </p>
          </div>
          <div className="step-cta">
            <Link href="/employees/import" className="btn btn--ghost">
              Import a CSV →
            </Link>
          </div>
        </li>

        <li className="step">
          <div className="step-number">03</div>
          <div className="step-body">
            <h3>Run your first payroll</h3>
            <p>
              Once guards are assigned and you&rsquo;ve recorded their daily
              time, close the period and Sentinel computes payslips with the
              four legal deductions: SSS, PhilHealth, Pag-IBIG, and
              withholding&nbsp;tax.
            </p>
          </div>
          <div className="step-cta">
            <Link href="/payroll" className="btn btn--ghost">
              Go to payroll →
            </Link>
          </div>
        </li>
      </ol>

      <p className="footnote">Slice 1 · Phase 8 · Dashboard shell</p>
    </>
  );
}
