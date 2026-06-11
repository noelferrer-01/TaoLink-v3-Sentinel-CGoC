import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hr } from '@/modules/hr';
import { listCredentials } from '@/modules/persons';
import { todayIso } from '@/core/dates';
import { PageShell } from '@/components/page-shell';
import { EmployeeDetailBody } from './employee-detail-body';
import { LicencesPanel } from './licences-panel';

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Load the merged shape so the form and the action diff against the SAME
  // source of truth. Using getEmployee (legacy columns) here while the action
  // diffs against getEmployeeWithIdentity (persons-sourced) caused two bugs:
  // (a) person-less rows: legacy names non-empty vs. persons baseline null →
  //     every save looked like an identity change → "not migrated" error.
  // (b) linked rows: page re-rendered stale legacy values; next save diffed
  //     those stale values as "changed" and silently reverted the prior edit.
  const employee = await hr.getEmployeeWithIdentity(id);
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

  // Slice 3b: the Person's credential wallet for the Licences & clearances panel.
  // personId is NOT NULL since 0024 (getEmployeeWithIdentity INNER-joins persons).
  const credentials = await listCredentials(employee.personId);

  // Identity fields are nullable for pre-backfill rows (personId null); fall
  // back to the employee code so the breadcrumb and title are never blank.
  const fullName = (employee.firstName && employee.lastName)
    ? `${employee.firstName} ${employee.lastName}`
    : employee.employeeCode;

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
      <LicencesPanel
        employeeId={employee.id}
        isArmedPost={employee.isArmedPost ?? false}
        credentials={credentials}
        today={todayIso()}
      />
    </PageShell>
  );
}
