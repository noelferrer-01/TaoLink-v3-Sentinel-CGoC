'use client';

import { useActionState, useState } from 'react';
import { assignAction, type FormState } from './actions';
import type { AssignableEmployee } from '@/modules/assignments';
import type { ClientWithDetachments } from '@/modules/clients';

const initialState: FormState = { kind: 'idle' };

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
  const hasDetachments = clientsWithDetachments.some((c) => c.detachments.length > 0);

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
              ? 'No unassigned guards. Add or import guards first.'
              : !hasDetachments
                ? 'No detachments. Add a client and a detachment first.'
                : ''
          }
        >
          Assign a guard
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 500 }}>Assign a guard</h2>
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
        <label className="field">
          <span className="field-label">Guard</span>
          <select className="input" name="employeeId" required defaultValue="">
            <option value="" disabled>
              Pick a guard…
            </option>
            {assignableEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.lastName}, {e.firstName} ({e.employeeCode})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Detachment</span>
          <select className="input" name="detachmentId" required defaultValue="">
            <option value="" disabled>
              Pick a detachment…
            </option>
            {clientsWithDetachments.map((c) =>
              c.detachments.length > 0 ? (
                <optgroup key={c.id} label={c.name}>
                  {c.detachments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </select>
        </label>

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
