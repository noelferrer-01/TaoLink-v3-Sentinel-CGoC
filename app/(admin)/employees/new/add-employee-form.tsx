'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import {
  EMPLOYMENT_TYPE_LABELS as EMPLOYMENT_TYPE_LABEL_MAP,
  PAY_FREQUENCY_LABELS as PAY_FREQUENCY_LABEL_MAP,
} from '@/modules/hr/labels';
import { TwoCol } from '@/components/form';
import { BirSectionIntro } from '../_bir-section-intro';
import { createEmployeeAction, type FormState } from './actions';

const EMPLOYMENT_TYPE_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABEL_MAP);
const PAY_FREQUENCY_OPTIONS = Object.entries(PAY_FREQUENCY_LABEL_MAP);

const initialState: FormState = { kind: 'idle' };

export function AddEmployeeForm() {
  const [state, formAction, pending] = useActionState(createEmployeeAction, initialState);

  return (
    <form action={formAction} className="form-stack" style={{ gap: '1.25rem' }}>
      <TwoCol>
        <TextField
          label="Employee code"
          name="employeeCode"
          required
          disabled={pending}
          hint="CGoC-facing ID, e.g. CG-00001. Must be unique."
        />
        <div />
      </TwoCol>

      <TwoCol>
        <TextField label="First name" name="firstName" required disabled={pending} />
        <TextField label="Last name" name="lastName" required disabled={pending} />
      </TwoCol>

      <TextField
        label="Email (optional)"
        name="email"
        type="email"
        disabled={pending}
        hint="Leave blank if the employee has no email on file."
      />

      <TwoCol>
        <SelectField
          label="Employment type"
          name="employmentType"
          defaultValue="GUARD"
          options={EMPLOYMENT_TYPE_OPTIONS}
          disabled={pending}
        />
        <SelectField
          label="Pay frequency"
          name="payFrequency"
          defaultValue="SEMI_MONTHLY"
          options={PAY_FREQUENCY_OPTIONS}
          disabled={pending}
        />
      </TwoCol>

      <TwoCol>
        <TextField
          label="Monthly basic salary (₱)"
          name="basicSalary"
          type="number"
          required
          disabled={pending}
        />
        <TextField
          label="Date hired"
          name="hiredOn"
          type="date"
          required
          disabled={pending}
        />
      </TwoCol>

      <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '0.5rem 0' }} />
      <BirSectionIntro />

      <TwoCol>
        <TextField
          label="BIR RDO code"
          name="rdoCode"
          maxLength={3}
          disabled={pending}
        />
        <TextField
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          disabled={pending}
        />
      </TwoCol>

      <TextField
        label="Address line 1"
        name="addressLine1"
        disabled={pending}
        hint="Street and house/unit number."
      />
      <TextField
        label="Address line 2"
        name="addressLine2"
        disabled={pending}
        hint="Barangay or subdivision, if any."
      />

      <TwoCol>
        <TextField label="City" name="city" disabled={pending} />
        <TextField label="Province" name="province" disabled={pending} />
      </TwoCol>

      <TextField label="Postal code" name="postalCode" maxLength={4} disabled={pending} />

      {state.kind === 'error' && (
        <div className="form-error" role="alert">
          {state.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Adding…' : 'Add employee'}
        </button>
        <Link
          href="/employees"
          className="btn btn--ghost"
          aria-disabled={pending}
          style={pending ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

// ─── Page-local form input helpers (uncontrolled native-form flavour) ─────
// `TwoCol` comes from @/components/form; only the input wrappers stay local
// because the controlled vs uncontrolled split is real.

interface TextFieldProps {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  hint?: string;
  defaultValue?: string;
}

function TextField({
  label,
  name,
  type = 'text',
  required,
  disabled,
  maxLength,
  hint,
  defaultValue,
}: TextFieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={`f-${name}`}>
        {label}
        {required && <span aria-hidden style={{ color: 'var(--ochre)', marginLeft: '0.25rem' }}>*</span>}
      </label>
      <input
        id={`f-${name}`}
        className="input"
        name={name}
        type={type}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        defaultValue={defaultValue}
        autoComplete="off"
      />
      {hint && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{hint}</span>}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<[string, string]>;
  disabled?: boolean;
}

function SelectField({ label, name, defaultValue, options, disabled }: SelectFieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={`f-${name}`}>
        {label}
      </label>
      <select
        id={`f-${name}`}
        className="input"
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
