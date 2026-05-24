'use client';

import { useActionState, useState } from 'react';
import { createDetachmentAction, type FormState } from '../actions';

const initialState: FormState = { kind: 'idle' };

export function AddDetachmentForm({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = createDetachmentAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (!open && state.kind !== 'success') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Add a detachment
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 500 }}>New detachment</h2>
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
          Close
        </button>
      </div>

      <form action={formAction} className="form-stack">
        <label className="field">
          <span className="field-label">Detachment name</span>
          <input
            className="input"
            name="name"
            required
            autoComplete="off"
            autoFocus
            placeholder="e.g. North Gate Post"
          />
        </label>

        <label className="field">
          <span className="field-label">Address (optional)</span>
          <input className="input" name="address" autoComplete="off" />
        </label>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Adding…' : 'Add detachment'}
        </button>

        {state.kind === 'error' ? (
          <p className="form-error" role="alert">{state.message}</p>
        ) : null}

        {state.kind === 'success' ? (
          <p style={{ color: 'var(--success)', fontSize: '0.9375rem' }} role="status">
            {state.message} You can add another above, or close this form.
          </p>
        ) : null}
      </form>
    </div>
  );
}
