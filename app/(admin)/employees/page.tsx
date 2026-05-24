import Link from 'next/link';
import { hr } from '@/modules/hr';
import { PageShell } from '@/components/page-shell';
import { EmployeesListBody, type EmployeeRow } from './employees-list-body';

const EMPLOYMENT_TYPES = ['GUARD', 'OFFICE_STAFF', 'SUPERVISOR', 'DRIVER', 'JANITOR', 'OTHER'] as const;
type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

function isEmploymentType(v: string | undefined): v is EmploymentType {
  return v != null && (EMPLOYMENT_TYPES as readonly string[]).includes(v);
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const type = isEmploymentType(params.type) ? params.type : undefined;

  const results = await hr.searchEmployees(q, {
    limit: 100,
    employmentType: type,
  });

  const employees: EmployeeRow[] = results.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    employmentType: e.employmentType,
    status: e.status,
  }));

  const toolbar = (
    <Link href="/employees/import" className="btn">
      Import a CSV →
    </Link>
  );

  return (
    <PageShell
      breadcrumb="Sentinel · Operations"
      title="Employees"
      description="Everyone on the CGoC payroll — guards, office staff, supervisors, drivers. Import a CSV to add many at once, or add them one at a time."
      toolbar={toolbar}
      footerHint="Click a row to view details. Select rows to bulk-assign or change status."
    >
      <EmployeesListBody
        initialQuery={q}
        initialType={type}
        employees={employees}
        hasAnyFilter={q.length > 0 || type != null}
      />
    </PageShell>
  );
}
