'use client';

/**
 * DataTable — generic sortable, selectable, row-clickable table.
 *
 * Features:
 * - Column config: key, label, sortable flag, optional custom render function
 * - Row selection via checkboxes (header selects all-on-page)
 * - Sticky bulk-action bar when at least one row is selected
 * - Whole-row click navigation (outside the checkbox cell)
 * - Empty state slot
 */

import { useCallback, type ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: string;
  dir: SortDir;
}

export interface ColumnDef<TRow> {
  /** Must match a property key of TRow OR be any string if render is provided. */
  key: string;
  label: string;
  sortable?: boolean;
  /** Custom cell renderer. Receives the full row. */
  render?: (row: TRow) => ReactNode;
  /** Optional CSS class for <th> and <td> */
  className?: string;
  /** If true, header aligns right */
  numeric?: boolean;
}

export interface BulkAction {
  label: string;
  onClick: (selectedKeys: Set<string>) => void;
  /** Optional styling variant — 'ghost' renders the secondary style */
  variant?: 'primary' | 'ghost';
}

export interface DataTableProps<TRow> {
  columns: ColumnDef<TRow>[];
  rows: TRow[];
  /** Returns a stable string key for each row */
  rowKey: (row: TRow) => string;
  /** Current sort state; undefined = uncontrolled / unsorted */
  sort?: SortState;
  /** Called when a sortable column header is clicked */
  onSortChange?: (sort: SortState) => void;
  /** Set of currently selected row keys */
  selectedKeys?: Set<string>;
  /** Called when selection changes */
  onSelectionChange?: (keys: Set<string>) => void;
  /** Bulk-action bar actions (shown when selectedKeys.size > 0) */
  bulkActions?: BulkAction[];
  /** Called when a non-checkbox cell / row is clicked */
  onRowClick?: (row: TRow) => void;
  /** Rendered when rows.length === 0 */
  emptyState?: ReactNode;
}

// ─── SortIcon ─────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir?: SortDir }) {
  const upColor = active && dir === 'asc' ? 'var(--ochre)' : 'var(--rule-strong)';
  const downColor = active && dir === 'desc' ? 'var(--ochre)' : 'var(--rule-strong)';
  return (
    <span aria-hidden style={{ display: 'inline-flex', flexDirection: 'column', marginLeft: '0.375rem', verticalAlign: 'middle', gap: '1px' }}>
      <svg width="7" height="5" viewBox="0 0 7 5" fill={upColor}><path d="M3.5 0 7 5H0z" /></svg>
      <svg width="7" height="5" viewBox="0 0 7 5" fill={downColor}><path d="M3.5 5 0 0h7z" /></svg>
    </span>
  );
}

// ─── DataTable ────────────────────────────────────────────────────────────────

export function DataTable<TRow>({
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
  selectedKeys,
  onSelectionChange,
  bulkActions = [],
  onRowClick,
  emptyState,
}: DataTableProps<TRow>) {
  const selectable = onSelectionChange !== undefined;
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selectedKeys?.has(rowKey(r)));
  const someSelected = selectable && !allSelected && rows.some((r) => selectedKeys?.has(rowKey(r)));

  const handleHeaderCheckbox = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(rows.map(rowKey)));
    }
  }, [allSelected, rows, rowKey, onSelectionChange]);

  const handleRowCheckbox = useCallback(
    (key: string) => {
      if (!onSelectionChange || !selectedKeys) return;
      const next = new Set(selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onSelectionChange(next);
    },
    [selectedKeys, onSelectionChange],
  );

  const handleSortClick = useCallback(
    (col: ColumnDef<TRow>) => {
      if (!col.sortable || !onSortChange) return;
      const nextDir: SortDir =
        sort?.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc';
      onSortChange({ key: col.key, dir: nextDir });
    },
    [sort, onSortChange],
  );

  const selectedCount = selectedKeys?.size ?? 0;
  const showBulkBar = selectable && selectedCount > 0 && bulkActions.length > 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Sticky bulk-action bar */}
      {showBulkBar && (
        <div
          data-testid="bulk-action-bar"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--navy)',
            color: 'var(--paper)',
            padding: '0.625rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            borderRadius: 'var(--radius) var(--radius) 0 0',
          }}
        >
          <span style={{ fontFamily: 'var(--ff-mono, monospace)', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {selectedCount} selected
          </span>
          <span style={{ flex: 1 }} />
          {bulkActions.map((action) => (
            <button
              key={action.label}
              className={action.variant === 'ghost' ? 'btn btn--ghost' : 'btn btn--ochre'}
              style={
                action.variant === 'ghost'
                  ? {
                      fontSize: '0.8125rem',
                      padding: '0.375rem 0.875rem',
                      // The bulk-action bar is dark navy; ghost's default ink-on-paper colors
                      // are invisible there. Override for legibility on the dark bar.
                      background: 'transparent',
                      color: 'var(--paper)',
                      borderColor: 'rgba(255,255,255,0.35)',
                    }
                  : { fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }
              }
              onClick={() => action.onClick(selectedKeys!)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="table-wrap" style={showBulkBar ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : undefined}>
        {rows.length === 0 ? (
          emptyState ?? (
            <div className="empty-state">
              <h3>Nothing here yet</h3>
              <p>No records to display.</p>
            </div>
          )
        ) : (
          <table className="table">
            <thead>
              <tr>
                {selectable && (
                  <th style={{ width: '2.5rem', padding: '0.75rem' }}>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={handleHeaderCheckbox}
                      style={{ cursor: 'pointer', accentColor: 'var(--ochre)' }}
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={[col.className, col.numeric ? 'cell-num' : ''].filter(Boolean).join(' ')}
                    style={col.sortable ? { cursor: 'pointer', userSelect: 'none' } : undefined}
                    onClick={col.sortable ? () => handleSortClick(col) : undefined}
                    aria-sort={
                      sort?.key === col.key
                        ? sort.dir === 'asc' ? 'ascending' : 'descending'
                        : col.sortable ? 'none' : undefined
                    }
                  >
                    {col.label}
                    {col.sortable && (
                      <SortIcon active={sort?.key === col.key} dir={sort?.key === col.key ? sort.dir : undefined} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = rowKey(row);
                const isSelected = selectedKeys?.has(key) ?? false;
                return (
                  <tr
                    key={key}
                    style={{
                      cursor: onRowClick ? 'pointer' : undefined,
                      background: isSelected ? 'rgba(184, 134, 47, 0.07)' : undefined,
                    }}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    data-selected={isSelected || undefined}
                  >
                    {selectable && (
                      <td
                        style={{ width: '2.5rem', padding: '0.875rem 0.75rem' }}
                        onClick={(e) => { e.stopPropagation(); handleRowCheckbox(key); }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select row ${key}`}
                          checked={isSelected}
                          onChange={() => handleRowCheckbox(key)}
                          style={{ cursor: 'pointer', accentColor: 'var(--ochre)' }}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={[col.className, col.numeric ? 'cell-num' : ''].filter(Boolean).join(' ')}
                      >
                        {col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
