import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable, type ColumnDef } from './data-table';

type Row = { id: string; name: string; age: number };

const cols: ColumnDef<Row>[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'age', label: 'Age', sortable: true, numeric: true },
];

const rows: Row[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
];

describe('DataTable', () => {
  it('renders column headers and row data', () => {
    render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders empty state when rows is empty', () => {
    render(
      <DataTable
        columns={cols}
        rows={[]}
        rowKey={(r) => r.id}
        emptyState={<p>No data</p>}
      />,
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('calls onSortChange when sortable header is clicked', () => {
    const onSort = vi.fn();
    render(
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        sort={{ key: 'name', dir: 'asc' }}
        onSortChange={onSort}
      />,
    );
    fireEvent.click(screen.getByText('Name'));
    expect(onSort).toHaveBeenCalledWith({ key: 'name', dir: 'desc' });
  });

  it('second click on active sort column reverses direction', () => {
    const onSort = vi.fn();
    render(
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        sort={{ key: 'name', dir: 'asc' }}
        onSortChange={onSort}
      />,
    );
    fireEvent.click(screen.getByText('Name'));
    expect(onSort).toHaveBeenCalledWith({ key: 'name', dir: 'desc' });
  });

  it('shows checkboxes and header checkbox when onSelectionChange is provided', () => {
    const onSel = vi.fn();
    render(
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKeys={new Set()}
        onSelectionChange={onSel}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    // header + 2 rows = 3
    expect(checkboxes).toHaveLength(3);
  });

  it('header checkbox calls onSelectionChange with all keys', () => {
    const onSel = vi.fn();
    render(
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKeys={new Set()}
        onSelectionChange={onSel}
      />,
    );
    fireEvent.click(screen.getByLabelText('Select all'));
    expect(onSel).toHaveBeenCalledWith(new Set(['1', '2']));
  });

  it('row checkbox toggles a single row key', () => {
    const onSel = vi.fn();
    render(
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKeys={new Set()}
        onSelectionChange={onSel}
      />,
    );
    fireEvent.click(screen.getByLabelText('Select row 1'));
    expect(onSel).toHaveBeenCalledWith(new Set(['1']));
  });

  it('shows bulk action bar when rows are selected', () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKeys={new Set(['1'])}
        onSelectionChange={vi.fn()}
        bulkActions={[{ label: 'Delete', onClick: vi.fn() }]}
      />,
    );
    expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not show bulk action bar when nothing selected', () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        selectedKeys={new Set()}
        onSelectionChange={vi.fn()}
        bulkActions={[{ label: 'Delete', onClick: vi.fn() }]}
      />,
    );
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked (outside checkbox)', () => {
    const onClick = vi.fn();
    render(
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onClick}
      />,
    );
    fireEvent.click(screen.getByText('Alice'));
    expect(onClick).toHaveBeenCalledWith(rows[0]);
  });

  it('uses custom render function for a column', () => {
    const customCols: ColumnDef<Row>[] = [
      {
        key: 'name',
        label: 'Name',
        render: (row) => <strong data-testid="custom">{row.name.toUpperCase()}</strong>,
      },
    ];
    render(<DataTable columns={customCols} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getAllByTestId('custom')[0]).toHaveTextContent('ALICE');
  });
});
