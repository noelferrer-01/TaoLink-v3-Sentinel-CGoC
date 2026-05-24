import Link from 'next/link';
import { ImportForm } from './import-form';

export default function ImportEmployeesPage() {
  return (
    <>
      <header className="page-header">
        <div className="breadcrumb">
          <Link href="/employees" style={{ textDecoration: 'none' }}>
            Guards
          </Link>{' '}
          · Import
        </div>
        <h1 className="page-title">Import guards from CSV</h1>
        <p className="page-sub">
          Upload a CSV with one row per guard. Sentinel checks every row{' '}
          <em>before</em> importing anything and tells you exactly what to fix
          if a row has a problem. Good rows are imported; bad rows are skipped
          with a clear reason.
        </p>
        <p className="page-sub">
          New here?{' '}
          <a href="/hr-employees-sample.csv" download>
            Download the sample CSV (10 rows)
          </a>{' '}
          to see the expected columns: <code>employee_code</code>,{' '}
          <code>first_name</code>, <code>last_name</code>, <code>email</code>,{' '}
          <code>basic_salary</code>, <code>pay_frequency</code>,{' '}
          <code>hired_on</code>, <code>sss_number</code>,{' '}
          <code>philhealth_number</code>, <code>pagibig_number</code>,{' '}
          <code>tin_number</code>.
        </p>
      </header>

      <ImportForm />

      <p className="footnote">Slice 1 · Phase 8 · Bulk import</p>
    </>
  );
}
