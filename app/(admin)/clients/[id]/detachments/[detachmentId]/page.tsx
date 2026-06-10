import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clients } from '@/modules/clients';
import { payrollCalendars } from '@/modules/payroll-calendars';
import { PageShell } from '@/components/page-shell';
import { DetachmentDetailBody } from './detachment-detail-body';

export default async function DetachmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; detachmentId: string }>;
}) {
  const { id: clientId, detachmentId } = await params;

  const [detachment, deployment] = await Promise.all([
    clients.getDetachment(detachmentId),
    clients.getDetachmentDeploymentSummary(detachmentId).catch(() => null),
  ]);
  if (!detachment || detachment.clientId !== clientId) notFound();

  const [client, allCalendars] = await Promise.all([
    clients.getClient(clientId),
    payrollCalendars.list(),
  ]);
  if (!client) notFound();

  const inheritedCalendar = client.defaultPayrollCalendarId
    ? allCalendars.find((c) => c.id === client.defaultPayrollCalendarId) ?? null
    : allCalendars.find((c) => c.clientId === null) ?? null;

  return (
    <PageShell
      breadcrumb={
        <>
          <Link href="/clients">Clients</Link> ·{' '}
          <Link href={`/clients/${client.id}`}>{client.name}</Link> ·{' '}
          {detachment.name}
        </>
      }
      title={detachment.name}
      description={`Detachment under ${client.name}. Update the contracted headcount and address so the deployment gauge stays accurate.`}
      footerHint="Editing here updates the detachment record and writes to the audit log."
    >
      <DetachmentDetailBody
        client={client}
        detachment={detachment}
        deployment={
          deployment ?? {
            required: detachment.requiredHeadcount ?? null,
            deployed: 0,
            gap:
              detachment.requiredHeadcount !== null
                ? 0 - detachment.requiredHeadcount
                : null,
          }
        }
        inheritedCalendar={inheritedCalendar}
      />
    </PageShell>
  );
}
