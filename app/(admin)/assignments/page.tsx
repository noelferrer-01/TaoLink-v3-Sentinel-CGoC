import Link from 'next/link';
import { assignments } from '@/modules/assignments';
import { clients } from '@/modules/clients';
import { AssignForm } from './assign-form';
import { EndAssignmentRow } from './end-assignment-row';

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
    <>
      <header className="page-header">
        <div className="breadcrumb">Sentinel · Operations</div>
        <h1 className="page-title">Assignments</h1>
        <p className="page-sub">
          Who&rsquo;s working where. Assign a guard to a detachment, end an
          assignment when the contract changes or the guard moves on. A guard
          can have only one active assignment at a time.
        </p>
      </header>

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
            Before you can assign anyone, you need at least one guard on file{' '}
            <strong>and</strong> at least one client with a detachment.
          </p>
          <div className="empty-state-actions">
            {!hasGuards ? (
              <Link href="/employees/import" className="btn btn--ghost">
                Import guards →
              </Link>
            ) : null}
            {!hasDetachments ? (
              <Link href="/clients" className="btn btn--ghost">
                Add a client →
              </Link>
            ) : null}
          </div>
        </div>
      ) : active.length === 0 ? (
        <div className="empty-state">
          <h3>No active assignments</h3>
          <p>Use the &ldquo;Assign a guard&rdquo; button above to put a guard on a detachment.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Guard</th>
                <th>Client &amp; detachment</th>
                <th>Started</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {active.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="cell-name">
                      {a.employee.lastName}, {a.employee.firstName}
                    </div>
                    <div className="cell-sub" style={{ fontFamily: 'var(--ff-mono)' }}>
                      {a.employee.employeeCode}
                    </div>
                  </td>
                  <td>
                    <div className="cell-name">{a.detachment.name}</div>
                    <div className="cell-sub">{a.client.name}</div>
                  </td>
                  <td className="cell-num">{a.startDate}</td>
                  <td>
                    <EndAssignmentRow
                      assignmentId={a.id}
                      today={asOf}
                      guardName={`${a.employee.firstName} ${a.employee.lastName}`}
                      detachmentName={a.detachment.name}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
