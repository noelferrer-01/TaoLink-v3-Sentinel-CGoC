import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { AddEmployeeForm } from './add-employee-form';

export default function AddEmployeePage() {
  return (
    <PageShell
      breadcrumb={
        <>
          <Link href="/employees">Employees</Link> · Add employee
        </>
      }
      title="Add an employee"
      description="Add one new hire to the master record. For many employees at once, use the CSV importer instead."
      footerHint="Required fields are marked with *. You can fill BIR fields now or later."
    >
      <p style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--ink-soft)', fontSize: '0.875rem' }}>
        Need to add many at once?{' '}
        <Link href="/employees/import" style={{ color: 'var(--navy)', textDecoration: 'underline' }}>
          Import a CSV →
        </Link>
      </p>
      <AddEmployeeForm />
    </PageShell>
  );
}
