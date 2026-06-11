import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clients } from '@/modules/clients';
import { payrollCalendars } from '@/modules/payroll-calendars';
import { billing } from '@/modules/billing';
import { PageShell } from '@/components/page-shell';
import { Pagination, clampPageSize } from '@/components/pagination';
import { AddDetachmentForm } from './add-detachment-form';
import { BillingSection } from './billing-section';
import { ClientDetailBody } from './client-detail-body';
import { DetachmentsList } from './detachments-list';

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const pageSize = clampPageSize(sp.size);

  const [client, detachmentResult, allCalendars, billingConfig] = await Promise.all([
    clients.getClient(id),
    clients.listDetachmentsWithDeploymentPage({
      clientId: id,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    payrollCalendars.list(),
    billing.getClientBillingConfig(id),
  ]);
  if (!client) notFound();

  const { rows: detachments, total } = detachmentResult;
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

      <BillingSection clientId={client.id} config={billingConfig} />

      <div className="section-rule" style={{ marginTop: '2.5rem' }}>
        <h2>Detachments</h2>
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-meta">
          {total}{' '}
          {total === 1 ? 'detachment' : 'detachments'}
        </div>
      </div>

      <DetachmentsList clientId={client.id} rows={detachments} />
      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        searchParams={sp}
        basePath={`/clients/${client.id}`}
        unitLabel="detachment"
      />

      <AddDetachmentForm clientId={client.id} />
    </PageShell>
  );
}
