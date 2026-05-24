import Link from 'next/link';
import { clients } from '@/modules/clients';
import { AddClientForm } from './add-client-form';

export default async function ClientsPage() {
  const list = await clients.listClients();

  return (
    <>
      <header className="page-header">
        <div className="breadcrumb">Sentinel · Operations</div>
        <h1 className="page-title">Clients</h1>
        <p className="page-sub">
          The companies that pay you for guard services. Each client has one or
          more detachments — the actual locations where guards are deployed.
        </p>
      </header>

      <div className="page-toolbar">
        <div className="page-toolbar-meta">
          {list.length} {list.length === 1 ? 'client' : 'clients'} on file
        </div>
      </div>

      <AddClientForm />

      {list.length === 0 ? (
        <div className="empty-state">
          <h3>No clients yet</h3>
          <p>
            Add your first client to start. Once it&rsquo;s in, you can add
            detachments and then assign guards to those detachments.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Added</th>
                <th aria-label="Open"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="cell-name">{c.name}</div>
                  </td>
                  <td>
                    {c.contactEmail ? <div>{c.contactEmail}</div> : null}
                    {c.contactPhone ? <div className="cell-sub">{c.contactPhone}</div> : null}
                    {!c.contactEmail && !c.contactPhone ? <span style={{ color: 'var(--muted)' }}>—</span> : null}
                  </td>
                  <td className="cell-num">{c.createdAt.toISOString().slice(0, 10)}</td>
                  <td>
                    <Link href={`/clients/${c.id}`} className="btn btn--ghost" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}>
                      Open →
                    </Link>
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
