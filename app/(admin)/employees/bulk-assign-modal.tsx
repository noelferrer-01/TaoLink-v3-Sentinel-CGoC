'use client';

import { useState, useTransition } from 'react';
import { ModalShell } from '@/components/modal-shell';
import { Typeahead } from '@/components/typeahead';
import type { ClientWithDetachments } from '@/modules/clients';
import { bulkAssignAction, type BulkAssignActionResult } from './actions';

type DetachmentOption = {
  id: string;
  name: string;
  clientName: string;
};

export interface BulkAssignModalProps {
  selectedEmployeeIds: string[];
  selectedEmployeeCount: number;
  employeeNameById: Map<string, string>;
  clientsWithDetachments: ClientWithDetachments[];
  today: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Modal for the "Assign to detachment…" bulk action on /employees.
 * Mirrors the BulkTransferModal on /assignments — same typeahead detachment
 * picker, same start-date field, same per-row error/success result panel.
 * Calls bulkAssignAction (which calls assignments.bulkAssign under the hood).
 *
 * Per-row failures (e.g. employee already has an active assignment) come
 * back in `result.errors` and are surfaced with friendly names. The batch
 * itself is treated as a partial success — successful rows are committed
 * even if some fail.
 */
export function BulkAssignModal({
  selectedEmployeeIds,
  selectedEmployeeCount,
  employeeNameById,
  clientsWithDetachments,
  today,
  onClose,
  onSuccess,
}: BulkAssignModalProps) {
  const detachmentOptions: DetachmentOption[] = clientsWithDetachments.flatMap((c) =>
    c.detachments.map((d) => ({ id: d.id, name: d.name, clientName: c.name })),
  );

  const [picked, setPicked] = useState<DetachmentOption | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkAssignActionResult | null>(null);

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
      setError('Pick a destination detachment from the dropdown.');
      return;
    }
    startTransition(async () => {
      const r = await bulkAssignAction(selectedEmployeeIds, picked.id, startDate);
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
      // After a partial-failure ack, refresh too so successful assigns disappear.
      onSuccess();
    }
    onClose();
  }

  // Result panel (after submit).
  if (result && result.kind === 'ok') {
    return (
      <ModalShell
        title="Assignment complete"
        subtitle={`Destination: ${picked?.clientName} · ${picked?.name}, starting ${startDate}.`}
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
        />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Assign to detachment"
      subtitle={`Assigning ${selectedEmployeeCount} ${selectedEmployeeCount === 1 ? 'employee' : 'employees'} to a detachment, starting on the chosen date.`}
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
            {pending ? 'Assigning…' : 'Confirm assignment'}
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
          <label className="field-label" htmlFor="bulk-assign-date">
            Start date
          </label>
          <input
            id="bulk-assign-date"
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={pending}
            style={{ maxWidth: '14rem' }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            Each new assignment starts on this date. Employees who already have
            an active assignment will be rejected (end the current one first).
          </span>
        </div>

        {error && <p className="form-error">{error}</p>}
      </div>
    </ModalShell>
  );
}

function ResultPanel({
  succeeded,
  errors,
  nameLookup,
}: {
  succeeded: number;
  errors: { id: string; reason: string }[];
  nameLookup: Map<string, string>;
}) {
  return (
    <div className="form-stack">
      <p style={{ margin: 0 }}>
        <strong style={{ color: 'var(--success)' }}>{succeeded}</strong>{' '}
        {succeeded === 1 ? 'employee' : 'employees'} assigned.
        {errors.length > 0 ? (
          <>
            {' '}<strong style={{ color: 'var(--danger)' }}>{errors.length}</strong>{' '}
            {errors.length === 1 ? 'row' : 'rows'} failed.
          </>
        ) : null}
      </p>
      {errors.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
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
