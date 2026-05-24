'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Client, Detachment } from '@/modules/clients/schema';
import type { PayrollCalendar } from '@/modules/payroll-calendars';
import type { DeploymentSummary } from '@/modules/clients';
import { DetailLayout } from '@/components/detail-layout';
import { Field, Muted } from '@/components/form';
import {
  updateDetachmentAction,
  type DetachmentPatchInput,
} from './actions';

type FormState = {
  name: string;
  address: string;
  /** Empty string represents "not set" (null). */
  requiredHeadcount: string;
};

function toFormState(d: Detachment): FormState {
  return {
    name: d.name,
    address: d.address ?? '',
    requiredHeadcount:
      d.requiredHeadcount === null ? '' : String(d.requiredHeadcount),
  };
}

function toPatch(form: FormState): DetachmentPatchInput {
  const blankToNull = (s: string): string | null =>
    s.trim().length === 0 ? null : s.trim();
  const headcountText = form.requiredHeadcount.trim();
  const headcountValue: number | null =
    headcountText.length === 0 ? null : Number(headcountText);
  return {
    name: form.name.trim(),
    address: blankToNull(form.address),
    requiredHeadcount: headcountValue,
  };
}

interface Props {
  client: Client;
  detachment: Detachment;
  deployment: DeploymentSummary;
  inheritedCalendar: PayrollCalendar | null;
}

export function DetachmentDetailBody({
  client,
  detachment,
  deployment,
  inheritedCalendar,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const initial = useMemo(() => toFormState(detachment), [detachment]);
  const [form, setForm] = useState<FormState>(initial);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isDirty = useMemo(
    () =>
      (Object.keys(initial) as Array<keyof FormState>).some(
        (k) => initial[k] !== form[k],
      ),
    [initial, form],
  );

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
    if (form.name.trim().length === 0) {
      setSaveError('Please enter the detachment name.');
      return;
    }
    const headcountText = form.requiredHeadcount.trim();
    if (headcountText.length > 0) {
      const n = Number(headcountText);
      if (!Number.isInteger(n) || n < 0) {
        setSaveError('Required headcount must be a whole number (0 or more), or blank.');
        return;
      }
    }
    startTransition(async () => {
      const result = await updateDetachmentAction(
        client.id,
        detachment.id,
        toPatch(form),
      );
      if (result.kind === 'ok') {
        setMode('view');
        router.refresh();
      } else {
        setSaveError(result.message);
      }
    });
  }

  // ─── View content ─────────────────────────────────────────────────────────
  const viewContent = (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
        gap: '1.25rem 2rem',
        margin: 0,
      }}
    >
      <Field label="Detachment name">{detachment.name}</Field>
      <Field label="Address">
        {detachment.address || <Muted>Not set</Muted>}
      </Field>
      <Field label="Required headcount">
        {detachment.requiredHeadcount === null ? (
          <>
            <Muted>Not set on contract</Muted>
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              Set this so the deployment gauge shows a target.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--ff-mono)', fontVariantNumeric: 'tabular-nums' }}>
              {detachment.requiredHeadcount}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              Currently deployed: {deployment.deployed}
              {deployment.gap !== null && (
                <>
                  {' '}
                  ({deployment.gap > 0
                    ? `+${deployment.gap} over`
                    : deployment.gap < 0
                      ? `${deployment.gap} short`
                      : 'fully deployed'})
                </>
              )}
            </div>
          </>
        )}
      </Field>
      <Field label="Payroll calendar">
        {inheritedCalendar ? (
          <>
            <div>{inheritedCalendar.name}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              Inherited from {client.name}. Per-detachment overrides come in a later slice.
            </div>
          </>
        ) : (
          <Muted>Uses global default</Muted>
        )}
      </Field>
    </dl>
  );

  // ─── Edit content ─────────────────────────────────────────────────────────
  const editContent = (
    <div className="form-stack" style={{ gap: '1.25rem' }}>
      {saveError && <p className="form-error">{saveError}</p>}

      <div className="field">
        <label className="field-label">Detachment name</label>
        <input
          className="input"
          type="text"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          required
          disabled={pending}
        />
      </div>

      <div className="field">
        <label className="field-label">Address (optional)</label>
        <input
          className="input"
          type="text"
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
          disabled={pending}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
          The physical site where employees report — e.g. SM Megamall Building B, 24/7.
        </span>
      </div>

      <div className="field">
        <label className="field-label">Required headcount (optional)</label>
        <input
          className="input"
          type="number"
          min={0}
          step={1}
          value={form.requiredHeadcount}
          onChange={(e) => updateField('requiredHeadcount', e.target.value)}
          disabled={pending}
          placeholder="e.g. 12"
          style={{ maxWidth: '12rem' }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
          The number of employees this client&rsquo;s contract calls for at this
          site. Leave blank if the contract doesn&rsquo;t specify. Drives the
          deployment gauge on the client&rsquo;s detachment list.
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
    />
  );
}
