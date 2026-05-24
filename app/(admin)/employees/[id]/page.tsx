import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hr } from '@/modules/hr';
import { PageShell } from '@/components/page-shell';
import { EmployeeDetailBody } from './employee-detail-body';

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = await hr.getEmployee(id);
  if (!employee) notFound();

  // For terminated employees, look up the precise termination timestamp from
  // the audit log so the 5-minute undo button can render the right countdown.
  // The `terminatedOn` column is day-resolution, so it can't drive a precise
  // window on its own.
  const terminatedAt =
    employee.status === 'terminated'
      ? await hr.getLatestTerminationTimestamp(employee.id)
      : null;

  const isBirReady = Boolean(
    employee.rdoCode && employee.dateOfBirth && employee.addressLine1,
  );

  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <PageShell
      breadcrumb={
        <>
          <Link href="/employees">Employees</Link> · {fullName}
        </>
      }
      title={fullName}
      description="View and update this employee's record. Use Change Status to move them through their employment lifecycle — that step is recorded separately so the reason stays on file."
      footerHint="Editing here updates the master record and writes to the audit log."
    >
      <EmployeeDetailBody
        employee={employee}
        isBirReady={isBirReady}
        terminatedAt={terminatedAt}
      />
    </PageShell>
  );
}
