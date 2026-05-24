'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { Typeahead } from '@/components/typeahead';
import { assignAction, type FormState } from './actions';
import type { AssignableEmployee } from '@/modules/assignments';
import type { ClientWithDetachments } from '@/modules/clients';

const initialState: FormState = { kind: 'idle' };
const STICKY_DETACHMENT_KEY = 'sentinel.assign-form.lastDetachmentId';

type DetachmentOption = {
  id: string;
  name: string;
  clientName: string;
};

export function AssignForm({
  assignableEmployees,
  clientsWithDetachments,
  today,
}: {
  assignableEmployees: AssignableEmployee[];
  clientsWithDetachments: ClientWithDetachments[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(assignAction, initialState);

  const hasGuards = assignableEmployees.length > 0;
  const detachmentOptions: DetachmentOption[] = useMemo(
    () =>
      clientsWithDetachments.flatMap((c) =>
        c.detachments.map((d) => ({ id: d.id, name: d.name, clientName: c.name })),
      ),
    [clientsWithDetachments],
  );
  const hasDetachments = detachmentOptions.length > 0;

  const [employee, setEmployee] = useState<AssignableEmployee | null>(null);
  const [detachment, setDetachment] = useState<DetachmentOption | null>(null);

  // Sticky default detachment: pre-fill from the last successful assignment in
  // this tab's session. Avoids clerks re-picking the same detachment row after
  // row when filling many guards into one post.
  useEffect(() => {
    if (!open || detachment) return;
    try {
      const id = sessionStorage.getItem(STICKY_DETACHMENT_KEY);
      if (!id) return;
      const match = detachmentOptions.find((d) => d.id === id);
      if (match) setDetachment(match);
    } catch {
      // sessionStorage may be unavailable; ignore.
    }
  }, [open, detachment, detachmentOptions]);

  // Persist + reset after success so the next "Assign an employee" click
  // starts clean on the employee picker but keeps the same detachment ready.
  useEffect(() => {
    if (state.kind !== 'success') return;
    if (detachment) {
      try {
        sessionStorage.setItem(STICKY_DETACHMENT_KEY, detachment.id);
      } catch {
        // ignore
      }
    }
    setEmployee(null);
  }, [state, detachment]);

  async function searchEmployees(query: string): Promise<AssignableEmployee[]> {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return assignableEmployees;
    return assignableEmployees.filter(
      (e) =>
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q),
    );
  }

  async function searchDetachments(query: string): Promise<DetachmentOption[]> {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return detachmentOptions;
    return detachmentOptions.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q),
    );
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button
          type="button"
          className="btn"
          onClick={() => setOpen(true)}
          disabled={!hasGuards || !hasDetachments}
          title={
            !hasGuards
              ? 'No unassigned employees. Add or import employees first.'
              : !hasDetachments
                ? 'No detachments. Add a client and a detachment first.'
                : ''
          }
        >
          Assign an employee
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 500 }}>Assign an employee</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            fontSize: '0.8125rem',
            cursor: 'pointer',
            fontFamily: 'var(--ff-mono)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Cancel
        </button>
      </div>

      <form action={formAction} className="form-stack">
        {/* Hidden inputs mirror the Typeahead state into the form payload. */}
        <input type="hidden" name="employeeId" value={employee?.id ?? ''} />
        <input type="hidden" name="detachmentId" value={detachment?.id ?? ''} />

        <div className="field">
          <label className="field-label">Employee</label>
          <Typeahead<AssignableEmployee>
            fetchOptions={searchEmployees}
            itemToString={(e) =>
              e ? `${e.lastName}, ${e.firstName} (${e.employeeCode})` : ''
            }
            selectedItem={employee}
            minChars={0}
            placeholder="Search by name or employee code…"
            aria-label="Employee"
            disabled={pending}
            onSelect={(e) => setEmployee(e ?? null)}
            renderItem={(e, highlighted) => (
              <div>
                <div style={{ fontWeight: highlighted ? 500 : 400 }}>
                  {e.lastName}, {e.firstName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--ff-mono)' }}>
                  {e.employeeCode}
                </div>
              </div>
            )}
          />
        </div>

        <div className="field">
          <label className="field-label">Detachment</label>
          <Typeahead<DetachmentOption>
            fetchOptions={searchDetachments}
            itemToString={(d) => (d ? `${d.clientName} · ${d.name}` : '')}
            selectedItem={detachment}
            minChars={0}
            placeholder="Search detachments by name or client…"
            aria-label="Detachment"
            disabled={pending}
            onSelect={(d) => setDetachment(d ?? null)}
            renderItem={(d, highlighted) => (
              <div>
                <div style={{ fontWeight: highlighted ? 500 : 400 }}>{d.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  {d.clientName}
                </div>
              </div>
            )}
          />
          {detachment && (
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              Sticks for the next assignment in this session — change it any time.
            </span>
          )}
        </div>

        <label className="field">
          <span className="field-label">Start date</span>
          <input className="input" name="startDate" type="date" defaultValue={today} required />
        </label>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Assigning…' : 'Confirm assignment'}
        </button>

        {state.kind === 'error' ? (
          <p className="form-error" role="alert">{state.message}</p>
        ) : null}

        {state.kind === 'success' ? (
          <p style={{ color: 'var(--success)', fontSize: '0.9375rem' }} role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
