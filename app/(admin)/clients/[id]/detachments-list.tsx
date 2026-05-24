'use client';

/**
 * Per-client detachments list with sortable columns and the deployment
 * "Deployed / Required" gauge cell. Rows are clickable → detail page.
 *
 * Data shape: `DetachmentWithDeployment` from `clients.listDetachmentsWithDeployment`
 * (single JOIN query, no N+1).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DataTable,
  sortRows,
  type ColumnDef,
  type SortState,
} from '@/components/data-table';
import type { DetachmentWithDeployment } from '@/modules/clients';

interface Props {
  clientId: string;
  rows: DetachmentWithDeployment[];
}

// ─── Deployment gauge cell ───────────────────────────────────────────────────

/**
 * 10-segment progress bar + signed gap chip. Color-banded:
 *   - green: met (gap >= 0)
 *   - amber: any gap below required
 *   - red:   gap > 20% of required
 * `required = null` ("not set on contract") renders the deployed count alone
 * with a muted "—" placeholder; no bar, no color band.
 */
function DeploymentCell({ row }: { row: DetachmentWithDeployment }) {
  const { deployed, requiredHeadcount: required, gap } = row;

  if (required === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ fontFamily: 'var(--ff-mono)', fontVariantNumeric: 'tabular-nums' }}>
          {deployed} / <span style={{ color: 'var(--muted)' }}>—</span>
        </div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--muted)' }}>
          Required not set
        </div>
      </div>
    );
  }

  // Color band — same thresholds the Phase 9.4 spec calls out.
  const gapValue = gap ?? 0;
  const overGapPct = required > 0 ? Math.abs(gapValue) / required : 0;
  const color =
    gapValue >= 0
      ? 'var(--success, #2f7a3a)'
      : overGapPct > 0.20
        ? 'var(--danger, #c0392b)'
        : 'var(--warning, #b8862f)';

  // Fill ratio for the 10-segment bar — clamp to [0,1].
  const fillRatio = required > 0 ? Math.min(1, deployed / required) : 0;
  const segments = 10;
  const filledSegments = Math.round(fillRatio * segments);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125rem', minWidth: '9rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.5rem',
          fontFamily: 'var(--ff-mono)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={{ fontSize: '0.9375rem' }}>
          {deployed} / {required}
        </span>
        <span
          style={{ fontSize: '0.75rem', color, fontWeight: 500 }}
          aria-label={
            gapValue === 0
              ? 'Fully deployed'
              : gapValue > 0
                ? `${gapValue} over required headcount`
                : `${Math.abs(gapValue)} under required headcount`
          }
        >
          {gapValue > 0 ? `+${gapValue}` : gapValue < 0 ? `⚠ ${gapValue}` : '✓'}
        </span>
      </div>
      <div
        role="presentation"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${segments}, 1fr)`,
          gap: '2px',
          height: '6px',
        }}
      >
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            style={{
              background: i < filledSegments ? color : 'var(--rule)',
              borderRadius: '1px',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── DetachmentsList ─────────────────────────────────────────────────────────

export function DetachmentsList({ clientId, rows }: Props) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState>({ key: 'createdAt', dir: 'asc' });

  const columns: ColumnDef<DetachmentWithDeployment>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Detachment',
        sortable: true,
        sortType: 'string',
        render: (d) => <span className="cell-name">{d.name}</span>,
      },
      {
        key: 'address',
        label: 'Address',
        sortable: true,
        sortType: 'string',
        render: (d) =>
          d.address ?? <span style={{ color: 'var(--muted)' }}>—</span>,
      },
      {
        key: 'deployment',
        label: 'Deployed / Required',
        sortable: true,
        // Sort by deployed count (not gap) so the table groups by raw size first
        // — clerks looking for empty detachments scan from the top, then the
        // amber/red chips tell them which need fill.
        sortType: 'number',
        sortValue: (d) => d.deployed,
        render: (d) => <DeploymentCell row={d} />,
      },
      {
        key: 'createdAt',
        label: 'Added',
        sortable: true,
        sortType: 'date',
        className: 'cell-num',
        render: (d) => d.createdAt.toISOString().slice(0, 10),
      },
    ],
    [],
  );

  const sortedRows = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);

  return (
    <DataTable<DetachmentWithDeployment>
      columns={columns}
      rows={sortedRows}
      rowKey={(d) => d.id}
      sort={sort}
      onSortChange={setSort}
      onRowClick={(d) => router.push(`/clients/${clientId}/detachments/${d.id}`)}
      emptyState={
        <div className="empty-state">
          <h3>No detachments yet</h3>
          <p>
            Add the first detachment for this client below. A detachment is the
            physical location where employees work — for example a mall, an
            office tower, or a warehouse.
          </p>
        </div>
      }
    />
  );
}
