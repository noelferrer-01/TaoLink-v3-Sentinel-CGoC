'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Employee } from '@/modules/hr/schema';
import type { EmployeeWithIdentity } from '@/modules/hr';
import {
  STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  PAY_FREQUENCY_LABELS,
} from '@/modules/hr/labels';
import { DetailLayout } from '@/components/detail-layout';
import { Field, Muted, TwoCol, ReadOnlyField } from '@/components/form';
import { useUndoWindow, formatMinSec } from '@/components/use-undo-window';
import { formatPeso } from '@/app/(admin)/payroll/peso';
import { BirSectionIntro } from '../_bir-section-intro';
import { updateEmployeeAction, undoTerminationAction, type EmployeePatchInput } from './actions';
import { ChangeStatusModal } from './change-status-modal';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Pull the editable subset out of the employee record into a form-state shape. */
type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  employmentType: Employee['employmentType'];
  basicSalary: string;
  payFrequency: Employee['payFrequency'];
  hiredOn: string;
  rdoCode: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
};

// EmployeeWithIdentity is the merged shape from page.tsx (persons-sourced
// identity + hr_employees employment fields). Identity fields are nullable for
// pre-backfill rows (personId null, no linked Person yet); we coerce null → ''
// at this boundary so FormState stays all-string. toPatch's blankToNull
// round-trips '' back to null when submitted, matching the action's normalize().
function toFormState(e: EmployeeWithIdentity): FormState {
  return {
    firstName: e.firstName ?? '',
    lastName: e.lastName ?? '',
    email: e.email ?? '',
    employmentType: e.employmentType,
    basicSalary: e.basicSalary,
    payFrequency: e.payFrequency,
    hiredOn: e.hiredOn,
    rdoCode: e.rdoCode ?? '',
    dateOfBirth: e.dateOfBirth ?? '',
    addressLine1: e.addressLine1 ?? '',
    addressLine2: e.addressLine2 ?? '',
    city: e.city ?? '',
    province: e.province ?? '',
    postalCode: e.postalCode ?? '',
  };
}

/** Convert form state back to a patch — nullable optional fields become null when blank. */
function toPatch(form: FormState): EmployeePatchInput {
  const blankToNull = (s: string): string | null => (s.trim().length === 0 ? null : s.trim());
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: blankToNull(form.email),
    employmentType: form.employmentType,
    basicSalary: form.basicSalary,
    payFrequency: form.payFrequency,
    hiredOn: form.hiredOn,
    rdoCode: blankToNull(form.rdoCode),
    dateOfBirth: blankToNull(form.dateOfBirth),
    addressLine1: blankToNull(form.addressLine1),
    addressLine2: blankToNull(form.addressLine2),
    city: blankToNull(form.city),
    province: blankToNull(form.province),
    postalCode: blankToNull(form.postalCode),
  };
}

interface Props {
  // EmployeeWithIdentity: employment fields from hr_employees + identity fields
  // from the linked Person (nullable for pre-backfill rows — personId null).
  // Page loads this shape via hr.getEmployeeWithIdentity so the form's initial
  // values and the action's diff baseline come from the same source.
  employee: EmployeeWithIdentity;
  isBirReady: boolean;
  /**
   * Precise termination timestamp from the audit log. Null when the employee
   * has never been terminated, or when no termination audit row exists. Drives
   * the 5-minute undo button visibility + countdown.
   */
  terminatedAt: Date | null;
}

export function EmployeeDetailBody({ employee, isBirReady, terminatedAt }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const initial = useMemo(() => toFormState(employee), [employee]);
  const [form, setForm] = useState<FormState>(initial);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [undoing, startUndoTransition] = useTransition();

  const undoWindow = useUndoWindow(
    employee.status === 'terminated' ? terminatedAt : null,
  );

  const isDirty = useMemo(() => {
    return (Object.keys(initial) as Array<keyof FormState>).some(
      (k) => initial[k] !== form[k],
    );
  }, [initial, form]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEdit() {
    setSaveError(null);
    setMode('edit');
  }

  function handleCancel() {
    setForm(initial);
    setSaveError(null);
    setMode('view');
  }

  function handleSave() {
    setSaveError(null);
    startTransition(async () => {
      const result = await updateEmployeeAction(employee.id, toPatch(form));
      if (result.kind === 'ok') {
        setMode('view');
        router.refresh();
      } else {
        setSaveError(result.message);
      }
    });
  }

  // ─── View content ────────────────────────────────────────────────────────
  const viewContent = (
    <div>
      {!isBirReady && (
        <button
          type="button"
          onClick={handleEdit}
          aria-label="BIR 2316 export is incomplete — open edit mode to fix"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            padding: '0.5rem 0.875rem',
            background: 'rgba(184, 134, 47, 0.12)',
            border: '1px solid var(--ochre)',
            borderRadius: 'var(--radius)',
            color: 'var(--ochre)',
            fontFamily: 'var(--ff-body), sans-serif',
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>!</span>
          <span>
            BIR 2316 export incomplete — add the Revenue District Office (RDO)
            code, date of birth, and address to enable the year-end form.
          </span>
        </button>
      )}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
          gap: '1.25rem 2rem',
          margin: 0,
        }}
      >
        <Field label="Employee code">
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.9375rem' }}>
            {employee.employeeCode}
          </span>
        </Field>
        <Field label="Status">
          <span className={`status-pill is-${employee.status}`}>
            {STATUS_LABELS[employee.status] ?? employee.status}
          </span>
        </Field>
        <Field label="First name">{employee.firstName}</Field>
        <Field label="Last name">{employee.lastName}</Field>
        <Field label="Email">{employee.email || <Muted>Not set</Muted>}</Field>
        <Field label="Employment type">
          {EMPLOYMENT_TYPE_LABELS[employee.employmentType] ?? employee.employmentType}
        </Field>
        <Field label="Monthly basic salary">{formatPeso(employee.basicSalary)}</Field>
        <Field label="Pay frequency">
          {PAY_FREQUENCY_LABELS[employee.payFrequency] ?? employee.payFrequency}
        </Field>
        <Field label="Date hired">{formatDate(employee.hiredOn)}</Field>
        {employee.terminatedOn && (
          <Field label="Date terminated">{formatDate(employee.terminatedOn)}</Field>
        )}
        <Field label="BIR RDO code">
          {employee.rdoCode || <Muted>Not set</Muted>}
        </Field>
        <Field label="Date of birth">
          {employee.dateOfBirth ? formatDate(employee.dateOfBirth) : <Muted>Not set</Muted>}
        </Field>
        <Field label="Address line 1">
          {employee.addressLine1 || <Muted>Not set</Muted>}
        </Field>
        <Field label="Address line 2">
          {employee.addressLine2 || <Muted>Not set</Muted>}
        </Field>
        <Field label="City">{employee.city || <Muted>Not set</Muted>}</Field>
        <Field label="Province">{employee.province || <Muted>Not set</Muted>}</Field>
        <Field label="Postal code">
          {employee.postalCode || <Muted>Not set</Muted>}
        </Field>
      </dl>
    </div>
  );

  // ─── Edit content ────────────────────────────────────────────────────────
  const editContent = (
    <div className="form-stack" style={{ gap: '1.25rem' }}>
      {saveError && <p className="form-error">{saveError}</p>}

      <ReadOnlyField label="Employee code" value={employee.employeeCode} mono />
      <ReadOnlyField
        label="Status"
        value={STATUS_LABELS[employee.status] ?? employee.status}
        hint="Status changes happen through the Change Status button so the reason gets recorded in the audit log."
      />

      <TwoCol>
        <TextField
          label="First name"
          value={form.firstName}
          onChange={(v) => updateField('firstName', v)}
          disabled={pending}
        />
        <TextField
          label="Last name"
          value={form.lastName}
          onChange={(v) => updateField('lastName', v)}
          disabled={pending}
        />
      </TwoCol>

      <TextField
        label="Email (optional)"
        value={form.email}
        onChange={(v) => updateField('email', v)}
        type="email"
        disabled={pending}
        hint="Leave blank if the employee has no email on file."
      />

      <TwoCol>
        <SelectField
          label="Employment type"
          value={form.employmentType}
          onChange={(v) => updateField('employmentType', v as Employee['employmentType'])}
          options={Object.entries(EMPLOYMENT_TYPE_LABELS)}
          disabled={pending}
        />
        <SelectField
          label="Pay frequency"
          value={form.payFrequency}
          onChange={(v) => updateField('payFrequency', v as Employee['payFrequency'])}
          options={Object.entries(PAY_FREQUENCY_LABELS)}
          disabled={pending}
        />
      </TwoCol>

      <TwoCol>
        <TextField
          label="Monthly basic salary (₱)"
          value={form.basicSalary}
          onChange={(v) => updateField('basicSalary', v)}
          type="number"
          required
          disabled={pending}
        />
        <TextField
          label="Date hired"
          value={form.hiredOn}
          onChange={(v) => updateField('hiredOn', v)}
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
          value={form.rdoCode}
          onChange={(v) => updateField('rdoCode', v)}
          maxLength={3}
          disabled={pending}
        />
        <TextField
          label="Date of birth"
          value={form.dateOfBirth}
          onChange={(v) => updateField('dateOfBirth', v)}
          type="date"
          disabled={pending}
        />
      </TwoCol>

      <TextField
        label="Address line 1"
        value={form.addressLine1}
        onChange={(v) => updateField('addressLine1', v)}
        disabled={pending}
        hint="Street and house/unit number."
      />
      <TextField
        label="Address line 2"
        value={form.addressLine2}
        onChange={(v) => updateField('addressLine2', v)}
        disabled={pending}
        hint="Barangay or subdivision, if any."
      />

      <TwoCol>
        <TextField
          label="City"
          value={form.city}
          onChange={(v) => updateField('city', v)}
          disabled={pending}
        />
        <TextField
          label="Province"
          value={form.province}
          onChange={(v) => updateField('province', v)}
          disabled={pending}
        />
      </TwoCol>

      <TextField
        label="Postal code"
        value={form.postalCode}
        onChange={(v) => updateField('postalCode', v)}
        maxLength={4}
        disabled={pending}
      />
    </div>
  );

  function handleUndoTermination() {
    const confirmed = window.confirm(
      'Undo the termination and put this employee back to Hired?',
    );
    if (!confirmed) return;
    startUndoTransition(async () => {
      const result = await undoTerminationAction(employee.id, '');
      if (result.kind === 'ok') {
        router.refresh();
      } else {
        alert(result.message);
      }
    });
  }

  // ─── Change-status button as a viewAction ────────────────────────────────
  // For terminated employees still inside the 5-minute window, swap the
  // disabled Change-status button for an Undo-termination button + live
  // countdown badge. Once the countdown hits 0:00, the disabled button
  // reappears automatically.
  const viewAction =
    employee.status === 'terminated' && undoWindow.active ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem' }}>
        <button
          type="button"
          className="btn btn--ochre"
          onClick={handleUndoTermination}
          disabled={undoing}
        >
          {undoing ? 'Undoing…' : 'Undo termination'}
        </button>
        <span
          aria-label={`${undoWindow.secondsLeft} seconds left to undo the termination`}
          title="The undo window closes when this hits 0:00. After that, the termination is final."
          style={{
            fontFamily: 'var(--ff-mono)',
            fontSize: '0.8125rem',
            color: 'var(--ink-soft)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatMinSec(undoWindow.secondsLeft)} left
        </span>
      </span>
    ) : (
      <button
        type="button"
        className="btn btn--ochre"
        onClick={() => setStatusModalOpen(true)}
        disabled={employee.status === 'terminated'}
        title={
          employee.status === 'terminated'
            ? 'Terminated employees cannot have their status changed.'
            : undefined
        }
      >
        Change status
      </button>
    );

  return (
    <>
      <DetailLayout
        mode={mode}
        viewContent={viewContent}
        editContent={editContent}
        isDirty={isDirty}
        onEdit={handleEdit}
        onCancel={handleCancel}
        onSave={handleSave}
        isSaving={pending}
        viewActions={viewAction}
      />
      <ChangeStatusModal
        employeeId={employee.id}
        currentStatus={employee.status}
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
      />
    </>
  );
}

// ─── Page-local form input helpers (controlled flavour) ───────────────────
// Visual structure helpers (Field, Muted, TwoCol, ReadOnlyField) come from
// `@/components/form` so fixes propagate to every detail/edit page.

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  hint?: string;
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  disabled,
  maxLength,
  hint,
}: TextFieldProps) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
      />
      {hint && (
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{hint}</span>
      )}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
  disabled?: boolean;
}

function SelectField({ label, value, onChange, options, disabled }: SelectFieldProps) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

