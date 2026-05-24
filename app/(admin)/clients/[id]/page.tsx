import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clients } from '@/modules/clients';
import { AddDetachmentForm } from './add-detachment-form';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await clients.getClient(id);
  if (!client) notFound();
  const detachments = await clients.listDetachments(id);

  return (
    <>
      <header className="page-header">
        <div className="breadcrumb">
          <Link href="/clients" style={{ textDecoration: 'none' }}>
            Clients
          </Link>{' '}
          · {client.name}
        </div>
        <h1 className="page-title">{client.name}</h1>
        <p className="page-sub">
          Manage the detachments &mdash; the actual locations where this
          client&rsquo;s guards are deployed. You&rsquo;ll assign guards to
          detachments, not directly to clients.
        </p>
      </header>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <div className="field-label">Contact email</div>
            <div style={{ marginTop: '0.25rem' }}>
              {client.contactEmail ?? <span style={{ color: 'var(--muted)' }}>—</span>}
            </div>
          </div>
          <div>
            <div className="field-label">Contact phone</div>
            <div style={{ marginTop: '0.25rem' }}>
              {client.contactPhone ?? <span style={{ color: 'var(--muted)' }}>—</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="section-rule">
        <h2>Detachments</h2>
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-meta">
          {detachments.length} {detachments.length === 1 ? 'detachment' : 'detachments'}
        </div>
      </div>

      {detachments.length === 0 ? (
        <div className="empty-state">
          <h3>No detachments yet</h3>
          <p>
            Add the first detachment for {client.name}. A detachment is the
            physical location where guards work — for example a mall, an office
            tower, or a warehouse.
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
                  <td>{d.address ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td className="cell-num">{d.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddDetachmentForm clientId={client.id} />
    </>
  );
}
