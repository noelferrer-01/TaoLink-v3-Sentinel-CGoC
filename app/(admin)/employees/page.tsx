import Link from 'next/link';
import { hr } from '@/modules/hr';
import { clients } from '@/modules/clients';
import { PageShell } from '@/components/page-shell';
import { Pagination, clampPageSize } from '@/components/pagination';
import { EmployeesListBody, type EmployeeRow } from './employees-list-body';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPLOYMENT_TYPES = ['GUARD', 'OFFICE_STAFF', 'SUPERVISOR', 'DRIVER', 'JANITOR', 'OTHER'] as const;
type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

function isEmploymentType(v: string | undefined): v is EmploymentType {
  return v != null && (EMPLOYMENT_TYPES as readonly string[]).includes(v);
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const type = isEmploymentType(params.type) ? params.type : undefined;
  const page = parsePage(params.page);
  const pageSize = clampPageSize(params.size);

  const [{ rows: results, total }, clientsWithDetachments] = await Promise.all([
    hr.listEmployeesPage({
      query: q,
      employmentType: type,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    clients.listClientsWithDetachments(),
  ]);

  // T10: firstName/lastName come from the linked Person (nullable during the
  // T3→T12 migration window). When no Person is linked yet, display the
  // employee code alone — no trailing comma in the Name column.
  const employees: EmployeeRow[] = results.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    displayName: e.lastName != null
      ? `${e.lastName}, ${e.firstName ?? ''}`.trim().replace(/,$/, '').trim()
      : e.employeeCode,
    employmentType: e.employmentType,
    status: e.status,
  }));

  const toolbar = (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <Link href="/employees/new" className="btn">
        + Add employee
      </Link>
      <Link href="/employees/import" className="btn btn--ghost">
        Import a CSV
      </Link>
    </div>
  );

  return (
    <PageShell
      title="Employees"
      description="Everyone on the CGoC payroll — guards, office staff, supervisors, drivers. Import a CSV to add many at once, or add them one at a time."
      toolbar={toolbar}
      footerHint="Click a row to view details. Select rows to bulk-assign to a detachment."
    >
      <EmployeesListBody
        initialQuery={q}
        initialType={type}
        employees={employees}
        hasAnyFilter={q.length > 0 || type != null}
        clientsWithDetachments={clientsWithDetachments}
        today={todayIso()}
      />
      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        searchParams={params}
        basePath="/employees"
        unitLabel="employee"
      />
    </PageShell>
  );
}
