'use client';

import { useActionState, useState } from 'react';
import { endAssignmentAction, type FormState } from './actions';

const initialState: FormState = { kind: 'idle' };

export function EndAssignmentRow({
  assignmentId,
  today,
  guardName,
  detachmentName,
}: {
  assignmentId: string;
  today: string;
  guardName: string;
  detachmentName: string;
}) {
  const [open, setOpen] = useState(false);
  const bound = endAssignmentAction.bind(null, assignmentId);
  const [state, formAction, pending] = useActionState(bound, initialState);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn--ghost"
        style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
        onClick={() => setOpen(true)}
      >
        End →
      </button>
    );
  }

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.625rem', minWidth: 280 }}>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-soft)' }}>
        Ending <strong>{guardName}</strong>&rsquo;s assignment at{' '}
        <strong>{detachmentName}</strong>.
      </p>
      <label className="field">
        <span className="field-label">End date</span>
        <input className="input" name="endDate" type="date" defaultValue={today} required />
      </label>
      <label className="field">
        <span className="field-label">Reason</span>
        <input
          className="input"
          name="endReason"
          required
          placeholder="e.g. Contract ended, transferred, AWOL"
          autoFocus
        />
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="btn btn--ochre" disabled={pending}>
          {pending ? 'Ending…' : 'End assignment'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setOpen(false)}
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
