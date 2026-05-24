'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Client } from '@/modules/clients/schema';
import type { PayrollCalendar } from '@/modules/payroll-calendars';
import { DetailLayout } from '@/components/detail-layout';
import { Typeahead } from '@/components/typeahead';
import { Field, Muted } from '@/components/form';
import { useUndoWindow, formatMinSec } from '@/components/use-undo-window';
import {
  updateClientAction,
  deleteClientAction,
  type ClientPatchInput,
} from './actions';

type FormState = {
  name: string;
  contactEmail: string;
  contactPhone: string;
  defaultPayrollCalendarId: string | null;
};

function toFormState(c: Client): FormState {
  return {
    name: c.name,
    contactEmail: c.contactEmail ?? '',
    contactPhone: c.contactPhone ?? '',
    defaultPayrollCalendarId: c.defaultPayrollCalendarId ?? null,
  };
}

function toPatch(form: FormState): ClientPatchInput {
  const blankToNull = (s: string): string | null =>
    s.trim().length === 0 ? null : s.trim();
  return {
    name: form.name.trim(),
    contactEmail: blankToNull(form.contactEmail),
    contactPhone: blankToNull(form.contactPhone),
    defaultPayrollCalendarId: form.defaultPayrollCalendarId,
  };
}

interface Props {
  client: Client;
  allCalendars: PayrollCalendar[];
  currentCalendar: PayrollCalendar | null;
}

export function ClientDetailBody({ client, allCalendars, currentCalendar }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const initial = useMemo(() => toFormState(client), [client]);
  const [form, setForm] = useState<FormState>(initial);
  const [selectedCalendar, setSelectedCalendar] = useState<PayrollCalendar | null>(
    currentCalendar,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

  const deleteWindow = useUndoWindow(client.createdAt);

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete this client? This can't be undone. The 5-minute mistake-window will close in ${formatMinSec(
        deleteWindow.secondsLeft,
      )}.`,
    );
    if (!confirmed) return;
    startDeleteTransition(async () => {
      const result = await deleteClientAction(client.id);
      // Success path triggers a server redirect; only error returns here.
      if (result && result.kind === 'error') {
        alert(result.message);
      }
    });
  }

  const deleteAction = deleteWindow.active ? (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem' }}
    >
      <button
        type="button"
        className="btn btn--ghost"
        onClick={handleDelete}
        disabled={deleting}
        title="Hard-delete this client and its empty detachments. Only allowed within 5 minutes of creation."
        style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
      >
        {deleting ? 'Deleting…' : 'Delete this client'}
      </button>
      <span
        aria-label={`${deleteWindow.secondsLeft} seconds left to delete this client`}
        title="The delete window closes when this hits 0:00. After that, use Archive (coming in a later slice)."
        style={{
          fontFamily: 'var(--ff-mono)',
          fontSize: '0.8125rem',
          color: 'var(--ink-soft)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatMinSec(deleteWindow.secondsLeft)} left
      </span>
    </span>
  ) : null;

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
    setSelectedCalendar(currentCalendar);
    setSaveError(null);
    setMode('view');
  }

  function handleSave() {
    setSaveError(null);
    if (form.name.trim().length === 0) {
      setSaveError('Please enter the client name.');
      return;
    }
    startTransition(async () => {
      const result = await updateClientAction(client.id, toPatch(form));
      if (result.kind === 'ok') {
        setMode('view');
        router.refresh();
      } else {
        setSaveError(result.message);
      }
    });
  }

  // Filter the pre-loaded list client-side. The dataset is small (dozens at most).
  async function fetchCalendars(query: string): Promise<PayrollCalendar[]> {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return allCalendars;
    return allCalendars.filter((c) => c.name.toLowerCase().includes(q));
  }

  // ─── View content ────────────────────────────────────────────────────────
  const viewContent = (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
        gap: '1.25rem 2rem',
        margin: 0,
      }}
    >
      <Field label="Client name">{client.name}</Field>
      <Field label="Contact email">
        {client.contactEmail || <Muted>Not set</Muted>}
      </Field>
      <Field label="Contact phone">
        {client.contactPhone || <Muted>Not set</Muted>}
      </Field>
      <Field label="Default payroll calendar">
        {currentCalendar ? (
          <>
            <div>{currentCalendar.name}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              {currentCalendar.clientId === null ? 'Global default' : 'Client-specific'}
            </div>
          </>
        ) : (
          <>
            <Muted>Uses global default</Muted>
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              Resolves to global default if blank — see Payroll Calendars page.
            </div>
          </>
        )}
      </Field>
    </dl>
  );

  // ─── Edit content ────────────────────────────────────────────────────────
  const editContent = (
    <div className="form-stack" style={{ gap: '1.25rem' }}>
      {saveError && <p className="form-error">{saveError}</p>}

      <TextField
        label="Client name"
        value={form.name}
        onChange={(v) => updateField('name', v)}
        required
        disabled={pending}
      />

      <TextField
        label="Contact email (optional)"
        value={form.contactEmail}
        onChange={(v) => updateField('contactEmail', v)}
        type="email"
        disabled={pending}
        hint="Leave blank if the client has no email on file."
      />

      <TextField
        label="Contact phone (optional)"
        value={form.contactPhone}
        onChange={(v) => updateField('contactPhone', v)}
        type="tel"
        disabled={pending}
      />

      <div className="field">
        <label className="field-label">Default payroll calendar (optional)</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typeahead<PayrollCalendar>
              fetchOptions={fetchCalendars}
              itemToString={(c) => c?.name ?? ''}
              selectedItem={selectedCalendar}
              minChars={0}
              placeholder="Search payroll calendars…"
              aria-label="Default payroll calendar"
              disabled={pending}
              onSelect={(c) => {
                setSelectedCalendar(c ?? null);
                updateField('defaultPayrollCalendarId', c?.id ?? null);
              }}
              renderItem={(c, highlighted) => (
                <div>
                  <div style={{ fontWeight: highlighted ? 500 : 400 }}>{c.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {c.clientId === null ? 'Global default' : 'Client-specific'}
                  </div>
                </div>
              )}
            />
          </div>
          {form.defaultPayrollCalendarId !== null && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={pending}
              onClick={() => {
                setSelectedCalendar(null);
                updateField('defaultPayrollCalendarId', null);
              }}
              title="Clear the calendar selection — this client will use the global default."
            >
              Clear
            </button>
          )}
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
          Leave blank to use the global default. The calendar drives cut-off and
          payday dates for this client&rsquo;s pay runs.
        </span>
      </div>
    </div>
  );

  return (
    <DetailLayout
      mode={mode}
      viewContent={viewContent}
      editContent={editContent}
      isDirty={isDirty}
      onEdit={handleEdit}
      onCancel={handleCancel}
      onSave={handleSave}
      isSaving={pending}
      viewActions={deleteAction}
    />
  );
}

// ─── Page-local form input helper (controlled flavour) ───────────────────
// Visual structure helpers (Field, Muted) come from `@/components/form`
// so fixes propagate to every detail/edit page.

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  disabled,
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
      />
      {hint && (
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{hint}</span>
      )}
    </div>
  );
}
