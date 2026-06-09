'use client';

import { useActionState } from 'react';
import Link from 'next/link';
// Import labels from the /labels subpath (pure constants) — NOT the module
// index, which pulls server-only DB code into the client bundle.
import { SOURCE_LABELS } from '@/modules/recruitment/labels';
import { EMPLOYMENT_TYPE_LABELS } from '@/modules/hr/labels';
import { TwoCol } from '@/components/form';
import { createApplicantAction, type FormState } from '../actions';

const SOURCE_OPTIONS = Object.entries(SOURCE_LABELS);
const POSITION_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABELS);
const initialState: FormState = { kind: 'idle' };

export function NewApplicantForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState(createApplicantAction, initialState);

  return (
    <form action={formAction} className="form-stack" style={{ gap: '1.25rem' }}>
      <TwoCol>
        <TextField label="First name" name="firstName" required disabled={pending} />
        <TextField label="Last name" name="lastName" required disabled={pending} />
      </TwoCol>

      <TwoCol>
        <TextField label="Middle name (optional)" name="middleName" disabled={pending} />
        <TextField label="Date of birth (optional)" name="dateOfBirth" type="date" disabled={pending} hint="Used to flag terminated/blacklisted matches." />
      </TwoCol>

      <TwoCol>
        <SelectField label="Position applied for" name="positionAppliedFor" defaultValue="GUARD" options={POSITION_OPTIONS} disabled={pending} />
        <SelectField label="Where did they apply from?" name="source" defaultValue="walk_in" options={SOURCE_OPTIONS} disabled={pending} />
      </TwoCol>

      <TwoCol>
        <TextField label="Date applied" name="appliedOn" type="date" required disabled={pending} defaultValue={today} />
        <TextField label="SSS number (optional)" name="sssNumber" disabled={pending} hint="Best identifier for catching re-applicants and blacklist matches." />
      </TwoCol>

      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
        <input type="checkbox" name="isArmedPost" disabled={pending} />
        <span className="field-label" style={{ margin: 0 }}>Armed post (requires LTOPF firearms license)</span>
      </label>

      <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '0.5rem 0' }} />

      <TwoCol>
        <TextField label="Phone (optional)" name="phone" disabled={pending} />
        <TextField label="Email (optional)" name="email" type="email" disabled={pending} />
      </TwoCol>

      <TwoCol>
        <TextField label="City (optional)" name="city" disabled={pending} />
        <TextField label="Province (optional)" name="province" disabled={pending} />
      </TwoCol>

      <TextField label="Notes (optional)" name="notes" disabled={pending} hint="Anything the recruiter wants to remember." />

      {state.kind === 'error' && (
        <div className="form-error" role="alert">{state.message}</div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Adding…' : 'Add applicant'}
        </button>
        <Link href="/recruitment" className="btn btn--ghost" aria-disabled={pending}
          style={pending ? { pointerEvents: 'none', opacity: 0.5 } : undefined}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

interface TextFieldProps {
  label: string; name: string; type?: string; required?: boolean; disabled?: boolean; hint?: string; defaultValue?: string;
}

function TextField({ label, name, type = 'text', required, disabled, hint, defaultValue }: TextFieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={`f-${name}`}>
        {label}
        {required && <span aria-hidden style={{ color: 'var(--ochre)', marginLeft: '0.25rem' }}>*</span>}
      </label>
      <input id={`f-${name}`} className="input" name={name} type={type} required={required} disabled={disabled} defaultValue={defaultValue} autoComplete="off" />
      {hint && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{hint}</span>}
    </div>
  );
}

interface SelectFieldProps {
  label: string; name: string; defaultValue: string; options: Array<[string, string]>; disabled?: boolean;
}

function SelectField({ label, name, defaultValue, options, disabled }: SelectFieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={`f-${name}`}>{label}</label>
      <select id={`f-${name}`} className="input" name={name} defaultValue={defaultValue} disabled={disabled}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}
