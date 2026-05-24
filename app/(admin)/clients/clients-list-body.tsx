'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type ColumnDef, type SortState } from '@/components/data-table';
import { SearchInput } from '@/components/search-input';

export interface ClientRow {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  /** ISO date string, already truncated to YYYY-MM-DD on the server. */
  createdAt: string;
}

interface Props {
  clients: ClientRow[];
}

export function ClientsListBody({ clients }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contactEmail ?? '').toLowerCase().includes(q),
    );
  }, [clients, query]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sort.key] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[sort.key] ?? '');
      const cmp = av.localeCompare(bv);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filteredRows, sort]);

  const columns: ColumnDef<ClientRow>[] = [
    {
      key: 'name',
      label: 'Client',
      sortable: true,
      render: (row) => <span className="cell-name">{row.name}</span>,
    },
    {
      key: 'contactEmail',
      label: 'Contact',
      render: (row) => {
        if (!row.contactEmail && !row.contactPhone) {
          return <span style={{ color: 'var(--muted)' }}>—</span>;
        }
        return (
          <>
            {row.contactEmail ? <div>{row.contactEmail}</div> : null}
            {row.contactPhone ? <div className="cell-sub">{row.contactPhone}</div> : null}
          </>
        );
      },
    },
    {
      key: 'createdAt',
      label: 'Added',
      sortable: true,
      render: (row) => <span className="cell-num">{row.createdAt}</span>,
    },
  ];

  const emptyState =
    query.trim().length > 0 ? (
      <div className="empty-state">
        <h3>No clients match this search</h3>
        <p>Try a different name or contact email, or clear the search.</p>
        <div className="empty-state-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setQuery('')}
          >
            Clear search
          </button>
        </div>
      </div>
    ) : (
      <div className="empty-state">
        <h3>No clients yet</h3>
        <p>
          Add your first client using the form below. Once it&rsquo;s in, you can
          add detachments and then assign employees to those detachments.
        </p>
      </div>
    );

  return (
    <>
      <div
        className="page-toolbar"
        style={{ gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}
      >
        <div style={{ flex: '1 1 18rem', minWidth: '15rem' }}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by client name or contact email…"
            aria-label="Search clients"
          />
        </div>
        <div className="page-toolbar-meta" style={{ marginLeft: 'auto' }}>
          {clients.length} {clients.length === 1 ? 'client' : 'clients'} on file
        </div>
      </div>

      <DataTable<ClientRow>
        columns={columns}
        rows={sortedRows}
        rowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        onRowClick={(row) => router.push(`/clients/${row.id}`)}
        emptyState={emptyState}
      />
    </>
  );
}
