'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { DataTable, type ColumnDef, type SortState } from '@/components/data-table';
import { SearchInput } from '@/components/search-input';

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  GUARD: 'Guard',
  OFFICE_STAFF: 'Office staff',
  SUPERVISOR: 'Supervisor',
  DRIVER: 'Driver',
  JANITOR: 'Janitor',
  OTHER: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  applicant: 'Applicant',
  hired: 'Hired',
  deployed: 'Deployed',
  reliever: 'Reliever',
  floating: 'Floating',
  on_leave: 'On leave',
  terminated: 'Terminated',
};

export interface EmployeeRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  employmentType: string;
  status: string;
}

interface Props {
  initialQuery: string;
  initialType: string | undefined;
  employees: EmployeeRow[];
  hasAnyFilter: boolean;
}

export function EmployeesListBody({ initialQuery, initialType, employees, hasAnyFilter }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<string>(initialType ?? '');
  const [sort, setSort] = useState<SortState>({ key: 'lastName', dir: 'asc' });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const pushUrl = (nextQuery: string, nextType: string) => {
    const params = new URLSearchParams();
    if (nextQuery.length > 0) params.set('q', nextQuery);
    if (nextType.length > 0) params.set('type', nextType);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs.length > 0 ? `/employees?${qs}` : '/employees');
    });
  };

  const handleQueryChange = (next: string) => {
    setQuery(next);
    pushUrl(next, type);
  };

  const handleTypeChange = (next: string) => {
    setType(next);
    pushUrl(query, next);
  };

  // Client-side sort over the (up to 100) rows the server returned.
  const sortedRows = useMemo(() => {
    const rows = [...employees];
    rows.sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sort.key] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[sort.key] ?? '');
      const cmp = av.localeCompare(bv);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [employees, sort]);

  const columns: ColumnDef<EmployeeRow>[] = [
    {
      key: 'employeeCode',
      label: 'Code',
      sortable: true,
      render: (row) => (
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.875rem' }}>{row.employeeCode}</span>
      ),
    },
    {
      key: 'lastName',
      label: 'Name',
      sortable: true,
      render: (row) => (
        <span className="cell-name">
          {row.lastName}, {row.firstName}
        </span>
      ),
    },
    {
      key: 'employmentType',
      label: 'Type',
      sortable: true,
      render: (row) => EMPLOYMENT_TYPE_LABELS[row.employmentType] ?? row.employmentType,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span className={`status-pill is-${row.status}`}>
          {STATUS_LABELS[row.status] ?? row.status}
        </span>
      ),
    },
  ];

  const bulkActions = [
    {
      label: 'Assign to detachment…',
      onClick: () => {
        // TODO Phase 9.5 — open bulk-assign modal (typeahead + date picker)
        alert(`Bulk-assign ${selectedKeys.size} selected — wire in Phase 9.5`);
      },
    },
    {
      label: 'Change status…',
      variant: 'ghost' as const,
      onClick: () => {
        alert(`Change status for ${selectedKeys.size} selected — wire in later phase`);
      },
    },
  ];

  const emptyState = hasAnyFilter ? (
    <div className="empty-state">
      <h3>No employees match this filter</h3>
      <p>Try clearing the search or selecting a different type.</p>
      <div className="empty-state-actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setQuery('');
            setType('');
            pushUrl('', '');
          }}
        >
          Clear filters
        </button>
      </div>
    </div>
  ) : (
    <div className="empty-state">
      <h3>No employees yet</h3>
      <p>
        Import a CSV to get started. Sentinel will check every row and tell you
        exactly what to fix before importing.
      </p>
      <div className="empty-state-actions">
        <Link href="/employees/import" className="btn">
          Import a CSV →
        </Link>
        <Link href="/hr-employees-sample.csv" className="btn btn--ghost" download>
          Download sample CSV
        </Link>
      </div>
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
            onChange={handleQueryChange}
            placeholder="Search by name or employee code…"
            aria-label="Search employees"
          />
        </div>
        <select
          value={type}
          onChange={(e) => handleTypeChange(e.target.value)}
          aria-label="Filter by employment type"
          style={{
            padding: '0.5rem 2.5rem 0.5rem 0.75rem',
            border: '1px solid var(--rule)',
            borderRadius: '4px',
            background:
              "var(--surface, white) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%23677' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\") no-repeat right 0.85rem center",
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
        >
          <option value="">All types</option>
          {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="page-toolbar-meta" style={{ marginLeft: 'auto' }}>
          {employees.length === 100
            ? `Showing first 100 matches`
            : `${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}`}
        </div>
      </div>

      <DataTable<EmployeeRow>
        columns={columns}
        rows={sortedRows}
        rowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        bulkActions={bulkActions}
        onRowClick={(row) => router.push(`/employees/${row.id}`)}
        emptyState={emptyState}
      />
    </>
  );
}
