import { clients } from '@/modules/clients';
import { PageShell } from '@/components/page-shell';
import { Pagination, clampPageSize } from '@/components/pagination';
import { AddClientForm } from './add-client-form';
import { ClientsListBody, type ClientRow } from './clients-list-body';

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = clampPageSize(params.size);

  const { rows: list, total } = await clients.listClientsPage({
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const rows: ClientRow[] = list.map((c) => ({
    id: c.id,
    name: c.name,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone,
    createdAt: c.createdAt.toISOString().slice(0, 10),
  }));

  return (
    <PageShell
      title="Clients"
      description="Companies that pay you for guard services. Each client has one or more detachments — the actual places employees are deployed."
      footerHint="Click a row to view details or edit the client."
    >
      <ClientsListBody clients={rows} />
      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        searchParams={params}
        basePath="/clients"
        unitLabel="client"
      />

      <div className="section-rule" style={{ marginTop: '2.5rem' }}>
        <h2>Add a new client</h2>
      </div>
      <AddClientForm />
    </PageShell>
  );
}
