'use client';

import { useActionState, useState } from 'react';
import { closePeriodAction, type FormState } from './actions';

const initialState: FormState = { kind: 'idle' };

export function ClosePeriodButton({
  start,
  end,
  label,
}: {
  start: string;
  end: string;
  label: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(closePeriodAction, initialState);

  if (state.kind === 'success') {
    return (
      <p style={{ color: 'var(--success)', fontSize: '0.9375rem', margin: '1rem 0' }} role="status">
        ✓ {state.message}
      </p>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn--ochre" onClick={() => setConfirming(true)}>
        Close period &amp; run payroll →
      </button>
    );
  }

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.75rem', maxWidth: 560 }}>
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="end" value={end} />
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
        Close DTR for <strong>{label}</strong>? This will:
      </p>
      <ul style={{ margin: '0 0 0 1rem', color: 'var(--ink-soft)', paddingLeft: '0.5rem' }}>
        <li>Lock all DTR entries for this period (no more edits).</li>
        <li>Automatically compute payslips for every guard with entries.</li>
      </ul>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
        You can still edit DTR for other periods. To unlock this one,
        you&rsquo;ll need to undo the lock manually.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="btn btn--ochre" disabled={pending}>
          {pending ? 'Closing & running payroll…' : 'Yes, close & run payroll'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
      {state.kind === 'error' ? (
        <p className="form-error" role="alert">{state.message}</p>
      ) : null}
    </form>
  );
}
