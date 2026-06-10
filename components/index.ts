/**
 * Shared UI components — public surface.
 *
 * All components in this directory are server-component-safe unless they
 * carry a 'use client' directive at the top of their file.
 *
 * Phase 8 components:
 * - DataTable   (client) — sortable, selectable, row-clickable table
 * - SearchInput (client) — debounced search input with clear button
 * - Typeahead   (client) — generic server-backed combobox (downshift)
 * - DetailLayout (client) — view/edit mode toggle with dirty-state guard
 * - PageShell   (server) — Fraunces title + description + body + footer hint
 */

export { DataTable } from './data-table';
export type { ColumnDef, BulkAction, SortState, SortDir, DataTableProps } from './data-table';

export { SearchInput } from './search-input';
export type { SearchInputProps } from './search-input';

export { Typeahead } from './typeahead';
export type { TypeaheadProps } from './typeahead';

export { DetailLayout } from './detail-layout';
export type { DetailLayoutProps } from './detail-layout';

export { PageShell } from './page-shell';
export type { PageShellProps } from './page-shell';
