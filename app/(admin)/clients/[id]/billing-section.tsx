'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TwoCol } from '@/components/form';
import type { ClientBillingConfig } from '@/modules/billing';
import { saveBillingConfigAction } from './actions';

interface Props {
  clientId: string;
  config: ClientBillingConfig | null;
}

/**
 * Billing & Contract section on the client detail page (Slice 4, wireframe W1).
 *
 * Lets HR/payroll clerks set the billing rate and payment terms for a client.
 * One rate per client for now; the helper note explains the growth path so
 * clerks don't worry about it being permanent.
 */
export function BillingSection({ clientId, config }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaved(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveBillingConfigAction(clientId, formData);
      if (result.kind === 'ok') {
        setSaved(true);
        router.refresh();
      } else {
        setSaveError(result.message);
      }
    });
  }

  const confirmNote = (
    <span style={{ color: 'var(--ochre)', fontSize: '0.8125rem', marginLeft: '0.375rem' }}>
      ⚑ confirm w/ CGoC
    </span>
  );

  return (
    <div className="card" style={{ marginTop: '2.5rem' }}>
      <h2
        style={{
          fontFamily: 'var(--ff-display)',
          fontSize: '1.25rem',
          color: 'var(--navy)',
          margin: '0 0 0.25rem',
        }}
      >
        Billing &amp; Contract
      </h2>
      <p className="field-hint" style={{ margin: '0 0 1rem' }}>
        Set the rate and payment terms used when generating invoices for this client.
      </p>

      <form onSubmit={handleSubmit} className="form-stack" style={{ gap: '1.25rem' }}>
        {saveError && (
          <p className="form-error" role="alert">
            {saveError}
          </p>
        )}

        <TwoCol>
          {/* Billing rate */}
          <div className="field">
            <label className="field-label" htmlFor="f-ratePerManday">
              Billing rate (₱ per guard / day worked)
              <span aria-hidden style={{ color: 'var(--ochre)', marginLeft: '0.25rem' }}>*</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>₱</span>
              <input
                id="f-ratePerManday"
                className="input"
                name="ratePerManday"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                required
                disabled={pending}
                defaultValue={config?.ratePerManday ?? ''}
                placeholder="e.g. 1250.00"
                autoComplete="off"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          {/* Payment terms */}
          <div className="field">
            <label className="field-label" htmlFor="f-paymentTermsDays">
              Payment terms (days)
            </label>
            <input
              id="f-paymentTermsDays"
              className="input"
              name="paymentTermsDays"
              type="number"
              step="1"
              min="1"
              inputMode="numeric"
              disabled={pending}
              defaultValue={config?.paymentTermsDays ?? 15}
              placeholder="15"
              autoComplete="off"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              e.g. 15 means the invoice is due 15 days after it&rsquo;s issued (Net 15).
            </span>
          </div>
        </TwoCol>

        {/* VAT & EWT toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="chargesVat"
              disabled={pending}
              defaultChecked={config?.chargesVat ?? true}
              style={{ width: '1rem', height: '1rem', flexShrink: 0 }}
            />
            <span style={{ fontSize: '0.9375rem', color: 'var(--ink)' }}>
              Charge VAT 12%
            </span>
            {confirmNote}
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="clientWithholdsEwt"
              disabled={pending}
              defaultChecked={config?.clientWithholdsEwt ?? true}
              style={{ width: '1rem', height: '1rem', flexShrink: 0 }}
            />
            <span style={{ fontSize: '0.9375rem', color: 'var(--ink)' }}>
              Client withholds 2% EWT
            </span>
            {confirmNote}
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button type="submit" className="btn" disabled={pending}>
            {pending ? 'Saving…' : 'Save billing config'}
          </button>

          {saved && !pending && (
            <span
              role="status"
              style={{ fontSize: '0.9375rem', color: 'var(--success)' }}
            >
              Saved.
            </span>
          )}
        </div>

        <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', margin: 0 }}>
          One rate per client now. If armed posts cost more later, this grows into a rate
          table — no rebuild.
        </p>
      </form>
    </div>
  );
}
