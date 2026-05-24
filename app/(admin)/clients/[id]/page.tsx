import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clients } from '@/modules/clients';
import { payrollCalendars } from '@/modules/payroll-calendars';
import { PageShell } from '@/components/page-shell';
import { AddDetachmentForm } from './add-detachment-form';
import { ClientDetailBody } from './client-detail-body';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client, detachments, allCalendars] = await Promise.all([
    clients.getClient(id),
    clients.listDetachments(id),
    payrollCalendars.list(),
  ]);
  if (!client) notFound();

  const currentCalendar =
    client.defaultPayrollCalendarId
      ? allCalendars.find((c) => c.id === client.defaultPayrollCalendarId) ?? null
      : null;

  return (
    <PageShell
      breadcrumb={
        <>
          <Link href="/clients">Clients</Link> · {client.name}
        </>
      }
      title={client.name}
      description="View and update this client's details. The default payroll calendar drives cut-off and payday dates for pay runs at this client's detachments."
      footerHint="Editing here updates the client record and writes to the audit log."
    >
      <ClientDetailBody
        client={client}
        allCalendars={allCalendars}
        currentCalendar={currentCalendar}
      />

      <div className="section-rule" style={{ marginTop: '2.5rem' }}>
        <h2>Detachments</h2>
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-meta">
          {detachments.length}{' '}
          {detachments.length === 1 ? 'detachment' : 'detachments'}
        </div>
      </div>

      {detachments.length === 0 ? (
        <div className="empty-state">
          <h3>No detachments yet</h3>
          <p>
            Add the first detachment for {client.name}. A detachment is the
            physical location where employees work — for example a mall, an
            office tower, or a warehouse.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Detachment</th>
                <th>Address</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {detachments.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="cell-name">{d.name}</div>
                  </td>
                  <td>
                    {d.address ?? (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td className="cell-num">
                    {d.createdAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddDetachmentForm clientId={client.id} />
    </PageShell>
  );
}
