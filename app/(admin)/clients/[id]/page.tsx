import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clients } from '@/modules/clients';
import { payrollCalendars } from '@/modules/payroll-calendars';
import { PageShell } from '@/components/page-shell';
import { AddDetachmentForm } from './add-detachment-form';
import { ClientDetailBody } from './client-detail-body';
import { DetachmentsList } from './detachments-list';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client, detachments, allCalendars] = await Promise.all([
    clients.getClient(id),
    clients.listDetachmentsWithDeployment(id),
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

      <DetachmentsList clientId={client.id} rows={detachments} />

      <AddDetachmentForm clientId={client.id} />
    </PageShell>
  );
}
