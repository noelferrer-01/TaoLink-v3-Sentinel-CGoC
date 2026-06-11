'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SelectField } from '@/components/form';
import { generateInvoiceAction } from './actions';

interface ClientOption {
  id: string;
  name: string;
}

interface PeriodOption {
  /** `"start|end"` — both are YYYY-MM-DD */
  value: string;
  label: string;
}

interface Props {
  clients: ClientOption[];
  periods: PeriodOption[];
}

/**
 * Generate SOA control (Slice 4, W2). Pick a client + a pay-run period, then
 * Generate pulls live from DTR to build a draft SOA. On success we route
 * straight to the new invoice's detail page; on a guard failure (no pay run,
 * no rate, etc.) we show the plain-language reason inline.
 */
export function GenerateSoa({ clients, periods }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [period, setPeriod] = useState(periods[0]?.value ?? '');

  const noClients = clients.length === 0;
  const noPeriods = periods.length === 0;
  const disabled = pending || noClients || noPeriods;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const [start, end] = period.split('|');
    if (!clientId || !start || !end) {
      setError('Pick a client and a period first.');
      return;
    }

    startTransition(async () => {
      const result = await generateInvoiceAction(clientId, start, end);
      if (result.kind === 'ok') {
        router.push(`/billing/${result.invoiceId}`);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2
        style={{
          fontFamily: 'var(--ff-display)',
          fontSize: '1.25rem',
          color: 'var(--navy)',
          margin: '0 0 0.25rem',
        }}
      >
        Generate a statement
      </h2>
      <p className="field-hint" style={{ margin: '0 0 1rem' }}>
        Pick a client and a closed pay-run period. We build a draft SOA from the
        guards&rsquo; days worked at that client &mdash; you can review it before
        finalizing.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        {error && (
          <p className="form-error" role="alert" style={{ flexBasis: '100%', margin: 0 }}>
            {error}
          </p>
        )}

        <div style={{ flex: '1 1 16rem', minWidth: '12rem' }}>
          <SelectField
            label="Client"
            name="clientId"
            value={clientId}
            onChange={setClientId}
            disabled={disabled}
            options={
              noClients
                ? [['', 'No clients on file']]
                : clients.map((c) => [c.id, c.name] as [string, string])
            }
          />
        </div>

        <div style={{ flex: '1 1 16rem', minWidth: '12rem' }}>
          <SelectField
            label="Period (pay run)"
            name="period"
            value={period}
            onChange={setPeriod}
            disabled={disabled}
            options={
              noPeriods
                ? [['', 'No pay runs yet — run payroll first']]
                : periods.map((p) => [p.value, p.label] as [string, string])
            }
          />
        </div>

        <button type="submit" className="btn" disabled={disabled}>
          {pending ? 'Generating…' : 'Generate SOA'}
        </button>
      </form>

      {(noClients || noPeriods) && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', margin: '0.75rem 0 0' }}>
          {noPeriods
            ? 'You need a closed pay-run period before you can bill it — close a DTR period and run payroll first.'
            : 'Add a client (with a billing rate) before generating a statement.'}
        </p>
      )}
    </div>
  );
}
