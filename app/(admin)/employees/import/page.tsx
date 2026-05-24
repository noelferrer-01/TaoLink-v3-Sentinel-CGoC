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
      </header>

      <ImportForm />

      <p className="footnote">Slice 1 · Phase 8 · Bulk import</p>
    </>
  );
}
