'use client';

import { useActionState, useEffect, useRef } from 'react';
import { TwoCol } from '@/components/form';
import { addToBlacklistAction, type FormState } from './actions';

const initial: FormState = { kind: 'idle' };

export function BlacklistForm() {
  const [state, formAction, pending] = useActionState(addToBlacklistAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form after a successful add.
  useEffect(() => {
    if (state.kind === 'ok') formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="form-stack" style={{ gap: '1rem' }}>
      <TwoCol>
        <Input label="First name" name="firstName" required disabled={pending} />
        <Input label="Last name" name="lastName" required disabled={pending} />
      </TwoCol>
      <TwoCol>
        <Input label="Date of birth (optional)" name="dateOfBirth" type="date" disabled={pending} />
        <Input label="SSS number (optional)" name="sssNumber" disabled={pending} hint="Most reliable matcher." />
      </TwoCol>
      <Input label="Reason" name="reason" required disabled={pending} hint="Why this person must not be re-hired." />

      {state.kind === 'error' && <div className="form-error" role="alert">{state.message}</div>}
      {state.kind === 'ok' && <div role="status" style={{ color: 'var(--success)', fontSize: '0.875rem' }}>✓ Added to the blacklist.</div>}

      <div>
        <button type="submit" className="btn" disabled={pending}>{pending ? 'Adding…' : 'Add to blacklist'}</button>
      </div>
    </form>
  );
}

function Input({ label, name, type = 'text', required, disabled, hint }: {
  label: string; name: string; type?: string; required?: boolean; disabled?: boolean; hint?: string;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={`bl-${name}`}>
        {label}
        {required && <span aria-hidden style={{ color: 'var(--ochre)', marginLeft: '0.25rem' }}>*</span>}
      </label>
      <input id={`bl-${name}`} className="input" name={name} type={type} required={required} disabled={disabled} autoComplete="off" />
      {hint && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{hint}</span>}
    </div>
  );
}
