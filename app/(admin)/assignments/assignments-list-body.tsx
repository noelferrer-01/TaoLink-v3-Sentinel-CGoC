'use client';

/**
 * Assignments list with multi-select + two bulk actions (Transfer / End).
 * Each bulk action opens a modal that collects the operation parameters,
 * calls the corresponding server action, then swaps the modal content to a
 * result panel that shows successes + per-row errors with friendly names.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DataTable,
  sortRows,
  type ColumnDef,
  type SortState,
} from '@/components/data-table';
import { Typeahead } from '@/components/typeahead';
import type { ActiveAssignmentRow } from '@/modules/assignments';
import type { ClientWithDetachments } from '@/modules/clients';
import {
  bulkTransferAction,
  bulkEndAssignmentsAction,
  type BulkActionResult,
} from './actions';

interface Props {
  rows: ActiveAssignmentRow[];
  clientsWithDetachments: ClientWithDetachments[];
  today: string;
}

type ModalKind = 'transfer' | 'end' | null;

type DetachmentOption = {
  id: string;
  name: string;
  clientName: string;
};

export function AssignmentsListBody({ rows, clientsWithDetachments, today }: Props) {
  const router = useRouter();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({ key: 'employee', dir: 'asc' });
  const [modal, setModal] = useState<ModalKind>(null);

  const detachmentOptions: DetachmentOption[] = useMemo(
    () =>
      clientsWithDetachments.flatMap((c) =>
        c.detachments.map((d) => ({ id: d.id, name: d.name, clientName: c.name })),
      ),
    [clientsWithDetachments],
  );

  // Friendly name lookup so error panels can say "Cruz, Juan" instead of UUIDs.
  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.employee.id, `${r.employee.lastName}, ${r.employee.firstName}`);
    }
    return map;
  }, [rows]);

  const assignmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(
        r.id,
        `${r.employee.lastName}, ${r.employee.firstName} @ ${r.detachment.name}`,
      );
    }
    return map;
  }, [rows]);

  // Selected rows → derive both assignment IDs and employee IDs.
  const selectedAssignmentIds = useMemo(() => Array.from(selectedKeys), [selectedKeys]);
  const selectedEmployeeIds = useMemo(
    () =>
      rows
        .filter((r) => selectedKeys.has(r.id))
        .map((r) => r.employee.id),
    [rows, selectedKeys],
  );

  const columns: ColumnDef<ActiveAssignmentRow>[] = useMemo(
    () => [
      {
        key: 'employee',
        label: 'Employee',
        sortable: true,
        sortType: 'string',
        sortValue: (r) => `${r.employee.lastName}, ${r.employee.firstName}`,
        render: (r) => (
          <div>
            <div className="cell-name">
              {r.employee.lastName}, {r.employee.firstName}
            </div>
            <div className="cell-sub" style={{ fontFamily: 'var(--ff-mono)' }}>
              {r.employee.employeeCode}
            </div>
          </div>
        ),
      },
      {
        key: 'detachment',
        label: 'Client & detachment',
        sortable: true,
        sortType: 'string',
        sortValue: (r) => `${r.client.name} · ${r.detachment.name}`,
        render: (r) => (
          <div>
            <div className="cell-name">{r.detachment.name}</div>
            <div className="cell-sub">{r.client.name}</div>
          </div>
        ),
      },
      {
        key: 'startDate',
        label: 'Started',
        sortable: true,
        sortType: 'date',
        className: 'cell-num',
        render: (r) => r.startDate,
      },
    ],
    [],
  );

  const sortedRows = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  function handleSuccess() {
    clearSelection();
    router.refresh();
  }

  return (
    <>
      <DataTable<ActiveAssignmentRow>
        columns={columns}
        rows={sortedRows}
        rowKey={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        bulkActions={[
          {
            label: 'Transfer to detachment…',
            onClick: () => setModal('transfer'),
          },
          {
            label: 'End assignment…',
            variant: 'ghost',
            onClick: () => setModal('end'),
          },
        ]}
        emptyState={
          <div className="empty-state">
            <h3>No active assignments</h3>
            <p>
              Use the &ldquo;Assign an employee&rdquo; button above to put an
              employee on a detachment.
            </p>
          </div>
        }
      />

      {modal === 'transfer' && (
        <TransferModal
          selectedAssignmentCount={selectedAssignmentIds.length}
          selectedEmployeeIds={selectedEmployeeIds}
          employeeNameById={employeeNameById}
          detachmentOptions={detachmentOptions}
          today={today}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
        />
      )}

      {modal === 'end' && (
        <EndModal
          selectedAssignmentIds={selectedAssignmentIds}
          assignmentNameById={assignmentNameById}
          today={today}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}

// ─── Shared modal chrome ─────────────────────────────────────────────────────

function ModalShell({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 16, 10, 0.4)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '5rem 1rem 1rem',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper-card)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 'var(--radius)',
          width: 'min(34rem, calc(100% - 2rem))',
          maxHeight: 'calc(100vh - 6rem)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '1.5rem 1.75rem 1.25rem', overflowY: 'auto' }}>
          <h2
            style={{
              fontFamily: 'var(--ff-display), system-ui, sans-serif',
              fontSize: '1.5rem',
              color: 'var(--navy)',
              margin: '0 0 0.5rem',
              letterSpacing: '-0.012em',
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 1.25rem' }}>{subtitle}</p>
          )}
          {children}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.625rem',
            padding: '1rem 1.75rem 1.25rem',
            borderTop: '1px solid var(--rule)',
            background: 'var(--paper-card)',
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

// ─── Result panel (shared by both bulk modals) ───────────────────────────────

function ResultPanel({
  succeeded,
  errors,
  nameLookup,
  noun,
}: {
  succeeded: number;
  errors: { id: string; reason: string }[];
  nameLookup: Map<string, string>;
  noun: string; // "transferred" / "ended"
}) {
  return (
    <div className="form-stack">
      <p style={{ margin: 0 }}>
        <strong>{succeeded}</strong> {noun} successfully.
        {errors.length > 0 && (
          <>
            {' '}
            <span style={{ color: 'var(--danger)' }}>
              {errors.length} couldn&rsquo;t be {noun}.
            </span>
          </>
        )}
      </p>
      {errors.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: '1.125rem',
            color: 'var(--ink-soft)',
            fontSize: '0.875rem',
            maxHeight: '14rem',
            overflowY: 'auto',
          }}
        >
          {errors.map((e) => (
            <li key={e.id} style={{ marginBottom: '0.375rem' }}>
              <strong>{nameLookup.get(e.id) ?? e.id}:</strong> {e.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Transfer modal ──────────────────────────────────────────────────────────

function TransferModal({
  selectedAssignmentCount,
  selectedEmployeeIds,
  employeeNameById,
  detachmentOptions,
  today,
  onClose,
  onSuccess,
}: {
  selectedAssignmentCount: number;
  selectedEmployeeIds: string[];
  employeeNameById: Map<string, string>;
  detachmentOptions: DetachmentOption[];
  today: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [picked, setPicked] = useState<DetachmentOption | null>(null);
  const [transferDate, setTransferDate] = useState(today);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkActionResult | null>(null);

  async function searchDetachments(query: string): Promise<DetachmentOption[]> {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return detachmentOptions;
    return detachmentOptions.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q),
    );
  }

  function handleConfirm() {
    setError(null);
    if (!picked) {
      setError('Pick the destination detachment from the dropdown.');
      return;
    }
    startTransition(async () => {
      const r = await bulkTransferAction(selectedEmployeeIds, picked.id, transferDate);
      if (r.kind === 'error') {
        setError(r.message);
        return;
      }
      setResult(r);
      if (r.errors.length === 0) {
        onSuccess();
      }
    });
  }

  function handleClose() {
    if (result && result.kind === 'ok' && result.errors.length > 0) {
      // After a partial-failure ack, refresh too so successful transfers disappear.
      onSuccess();
    }
    onClose();
  }

  if (result && result.kind === 'ok') {
    return (
      <ModalShell
        title="Transfer complete"
        subtitle={`Destination: ${picked?.clientName} · ${picked?.name}, starting ${transferDate}.`}
        onClose={handleClose}
        footer={
          <button type="button" className="btn" onClick={handleClose}>
            Done
          </button>
        }
      >
        <ResultPanel
          succeeded={result.succeeded}
          errors={result.errors}
          nameLookup={employeeNameById}
          noun="transferred"
        />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Transfer to detachment"
      subtitle={`Moving ${selectedAssignmentCount} ${selectedAssignmentCount === 1 ? 'employee' : 'employees'} to a new detachment. Their current assignment will be ended on the day before the transfer date.`}
      onClose={pending ? () => {} : onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? 'Transferring…' : 'Confirm transfer'}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="field">
          <label className="field-label">Destination detachment</label>
          <Typeahead<DetachmentOption>
            fetchOptions={searchDetachments}
            itemToString={(d) => (d ? `${d.clientName} · ${d.name}` : '')}
            selectedItem={picked}
            minChars={0}
            placeholder="Search detachments…"
            aria-label="Destination detachment"
            disabled={pending}
            onSelect={(d) => setPicked(d ?? null)}
            renderItem={(d, highlighted) => (
              <div>
                <div style={{ fontWeight: highlighted ? 500 : 400 }}>{d.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  {d.clientName}
                </div>
              </div>
            )}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="bulk-transfer-date">
            Transfer date
          </label>
          <input
            id="bulk-transfer-date"
            type="date"
            className="input"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            disabled={pending}
            style={{ maxWidth: '14rem' }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            The new assignment starts on this date. The old one ends the day before.
          </span>
        </div>

        {error && <p className="form-error">{error}</p>}
      </div>
    </ModalShell>
  );
}

// ─── End modal ───────────────────────────────────────────────────────────────

function EndModal({
  selectedAssignmentIds,
  assignmentNameById,
  today,
  onClose,
  onSuccess,
}: {
  selectedAssignmentIds: string[];
  assignmentNameById: Map<string, string>;
  today: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkActionResult | null>(null);

  function handleConfirm() {
    setError(null);
    if (reason.trim().length < 3) {
      setError('Add a short reason so the audit log makes sense later.');
      return;
    }
    startTransition(async () => {
      const r = await bulkEndAssignmentsAction(selectedAssignmentIds, endDate, reason);
      if (r.kind === 'error') {
        setError(r.message);
        return;
      }
      setResult(r);
      if (r.errors.length === 0) {
        onSuccess();
      }
    });
  }

  function handleClose() {
    if (result && result.kind === 'ok' && result.errors.length > 0) {
      onSuccess();
    }
    onClose();
  }

  if (result && result.kind === 'ok') {
    return (
      <ModalShell
        title="Assignments ended"
        subtitle={`End date: ${endDate}.`}
        onClose={handleClose}
        footer={
          <button type="button" className="btn" onClick={handleClose}>
            Done
          </button>
        }
      >
        <ResultPanel
          succeeded={result.succeeded}
          errors={result.errors}
          nameLookup={assignmentNameById}
          noun="ended"
        />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="End assignment"
      subtitle={`Ending ${selectedAssignmentIds.length} ${selectedAssignmentIds.length === 1 ? 'assignment' : 'assignments'}. The employees become unassigned and can be reassigned afterward.`}
      onClose={pending ? () => {} : onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? 'Ending…' : 'Confirm end'}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="field">
          <label className="field-label" htmlFor="bulk-end-date">
            End date
          </label>
          <input
            id="bulk-end-date"
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={pending}
            style={{ maxWidth: '14rem' }}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="bulk-end-reason">
            Reason
          </label>
          <textarea
            id="bulk-end-reason"
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are these assignments ending? E.g. 'Contract not renewed, mall posts dissolved.'"
            disabled={pending}
          />
        </div>

        {error && <p className="form-error">{error}</p>}
      </div>
    </ModalShell>
  );
}
