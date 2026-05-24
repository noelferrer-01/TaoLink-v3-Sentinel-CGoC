'use client';

import { useActionState, useState } from 'react';
import { createClientAction, type FormState } from './actions';

const initialState: FormState = { kind: 'idle' };

export function AddClientForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createClientAction, initialState);

  if (!open) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Add a client
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 500 }}>New client</h2>
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
          <span className="field-label">Client name</span>
          <input
            className="input"
            name="name"
            required
            autoComplete="off"
            autoFocus
            placeholder="e.g. SM Megamall Holdings"
          />
        </label>

        <label className="field">
          <span className="field-label">Contact email (optional)</span>
          <input className="input" name="contactEmail" type="email" autoComplete="off" />
        </label>

        <label className="field">
          <span className="field-label">Contact phone (optional)</span>
          <input className="input" name="contactPhone" autoComplete="off" placeholder="+63 2 1234 5678" />
        </label>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Adding…' : 'Add client'}
        </button>

        {state.kind === 'error' ? (
          <p className="form-error" role="alert">{state.message}</p>
        ) : null}
      </form>
    </div>
  );
}
