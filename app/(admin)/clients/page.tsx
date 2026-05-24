import { clients } from '@/modules/clients';
import { PageShell } from '@/components/page-shell';
import { AddClientForm } from './add-client-form';
import { ClientsListBody, type ClientRow } from './clients-list-body';

export default async function ClientsPage() {
  const list = await clients.listClients();

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

      <div className="section-rule" style={{ marginTop: '2.5rem' }}>
        <h2>Add a new client</h2>
      </div>
      <AddClientForm />
    </PageShell>
  );
}
