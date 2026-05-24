'use client';

import { useActionState, useState } from 'react';
import { lockPayRunAction, type FormState } from './actions';

const initialState: FormState = { kind: 'idle' };

export function LockPayRunButton({
  payRunId,
  period,
}: {
  payRunId: string;
  period: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const bound = lockPayRunAction.bind(null, payRunId);
  const [state, formAction, pending] = useActionState(bound, initialState);

  if (state.kind === 'success') {
    return (
      <p style={{ color: 'var(--success)', margin: '1rem 0', fontSize: '0.9375rem' }} role="status">
        ✓ {state.message} The payslips for this period can no longer be edited.
      </p>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn--ochre" onClick={() => setConfirming(true)}>
        Lock this pay run →
      </button>
    );
  }

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.75rem', maxWidth: 560 }}>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
        Lock the pay run for <strong>{period}</strong>? This means:
      </p>
      <ul style={{ margin: '0 0 0 1rem', color: 'var(--ink-soft)', paddingLeft: '0.5rem' }}>
        <li>Payslips become read-only — no more re-runs for this period.</li>
        <li>You can now generate government reports (SSS R-3, BIR 2316).</li>
      </ul>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="btn btn--ochre" disabled={pending}>
          {pending ? 'Locking…' : 'Yes, lock'}
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
