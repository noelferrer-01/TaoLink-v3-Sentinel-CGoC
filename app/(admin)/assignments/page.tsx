import Link from 'next/link';
import { assignments } from '@/modules/assignments';
import { clients } from '@/modules/clients';
import { PageShell } from '@/components/page-shell';
import { Pagination, clampPageSize } from '@/components/pagination';
import { AssignForm } from './assign-form';
import { AssignmentsListBody } from './assignments-list-body';
import { todayIso } from '@/core/dates';

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = clampPageSize(params.size);
  const asOf = todayIso();

  const [activeResult, assignable, clientsWithDetachments] = await Promise.all([
    assignments.listActiveAssignments(asOf, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    assignments.listAssignableEmployees(asOf),
    clients.listClientsWithDetachments(),
  ]);

  const { rows: active, total } = activeResult;
  const hasGuards = assignable.length > 0;
  const hasDetachments = clientsWithDetachments.some((c) => c.detachments.length > 0);
  const blocked = !hasGuards || !hasDetachments;

  return (
    <PageShell
      breadcrumb={<>Sentinel · Operations · Assignments</>}
      title="Assignments"
      description="Who's working where. Assign an employee to a detachment, end an assignment when the contract changes or the employee moves on. An employee can have only one active assignment at a time."
      footerHint="Select rows to transfer or end in bulk. Use the form above to add one assignment at a time."
    >
      <div className="page-toolbar">
        <div className="page-toolbar-meta">
          {total} active {total === 1 ? 'assignment' : 'assignments'}
        </div>
      </div>

      <AssignForm
        assignableEmployees={assignable}
        clientsWithDetachments={clientsWithDetachments}
        today={asOf}
      />

      {blocked && total === 0 ? (
        <div className="empty-state">
          <h3>Nothing assigned yet</h3>
          <p>
            Before you can assign anyone, you need at least one employee on file{' '}
            <strong>and</strong> at least one client with a detachment.
          </p>
          <div className="empty-state-actions">
            {!hasGuards ? (
              <Link href="/employees/import" className="btn btn--ghost">
                Import employees →
              </Link>
            ) : null}
            {!hasDetachments ? (
              <Link href="/clients" className="btn btn--ghost">
                Add a client →
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <AssignmentsListBody
            rows={active}
            clientsWithDetachments={clientsWithDetachments}
            today={asOf}
          />
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            searchParams={params}
            basePath="/assignments"
            unitLabel="assignment"
          />
        </>
      )}
    </PageShell>
  );
}
