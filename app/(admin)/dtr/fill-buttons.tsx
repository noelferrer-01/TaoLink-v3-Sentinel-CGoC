'use client';

import { useActionState } from 'react';
import {
  bulkFillWorkedAction,
  fillAllAction,
  type FormState,
} from './actions';

const initialState: FormState = { kind: 'idle' };

export function FillRowButton({
  employeeId,
  start,
  end,
  label,
}: {
  employeeId: string;
  start: string;
  end: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(bulkFillWorkedAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="end" value={end} />
      <button
        type="submit"
        className="btn btn--ghost"
        style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
        disabled={pending}
        title={state.kind === 'success' ? state.message : `Fill all empty days for ${label} as worked`}
      >
        {pending ? 'Filling…' : 'Fill empty days →'}
      </button>
    </form>
  );
}

export function FillAllButton({
  employeeIds,
  start,
  end,
}: {
  employeeIds: string[];
  start: string;
  end: string;
}) {
  const [state, formAction, pending] = useActionState(fillAllAction, initialState);

  return (
    <div>
      <form action={formAction} style={{ display: 'inline-block' }}>
        <input type="hidden" name="start" value={start} />
        <input type="hidden" name="end" value={end} />
        {employeeIds.map((id) => (
          <input key={id} type="hidden" name="employeeId" value={id} />
        ))}
        <button type="submit" className="btn" disabled={pending || employeeIds.length === 0}>
          {pending
            ? 'Filling all…'
            : `Mark all ${employeeIds.length} guards as worked for this period`}
        </button>
      </form>
      {state.kind === 'success' ? (
        <p style={{ color: 'var(--success)', fontSize: '0.875rem', margin: '0.5rem 0 0' }} role="status">
          ✓ {state.message}
        </p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="form-error" role="alert" style={{ marginTop: '0.5rem' }}>{state.message}</p>
      ) : null}
    </div>
  );
}
