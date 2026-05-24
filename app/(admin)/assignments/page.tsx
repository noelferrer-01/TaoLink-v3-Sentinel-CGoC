import Link from 'next/link';
import { assignments } from '@/modules/assignments';
import { clients } from '@/modules/clients';
import { PageShell } from '@/components/page-shell';
import { AssignForm } from './assign-form';
import { AssignmentsListBody } from './assignments-list-body';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AssignmentsPage() {
  const asOf = today();
  const [active, assignable, clientsWithDetachments] = await Promise.all([
    assignments.listActiveAssignments(asOf),
    assignments.listAssignableEmployees(asOf),
    clients.listClientsWithDetachments(),
  ]);

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
          {active.length} active {active.length === 1 ? 'assignment' : 'assignments'}
        </div>
      </div>

      <AssignForm
        assignableEmployees={assignable}
        clientsWithDetachments={clientsWithDetachments}
        today={asOf}
      />

      {blocked && active.length === 0 ? (
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
        <AssignmentsListBody
          rows={active}
          clientsWithDetachments={clientsWithDetachments}
          today={asOf}
        />
      )}
    </PageShell>
  );
}
