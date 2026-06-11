'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { finalizeInvoiceAction, markPaidAction, type InvoiceActionResult } from '../actions';

interface Props {
  invoiceId: string;
  status: 'draft' | 'finalized' | 'paid';
}

/**
 * SOA action bar (Slice 4, W4). Status-gated to match the engine:
 *   - draft     → Finalize (assigns the SOA number)
 *   - finalized → Mark paid
 *   - paid      → no actions (the page shows a "Paid on …" state instead)
 * Print is always available. Action failures render inline — no error overlay.
 *
 * This is a `.no-print` bar: it's hidden when the user prints the SOA.
 */
export function InvoiceActions({ invoiceId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // One runner for both transitions — finalize and mark-paid share the exact
  // same shape (clear error → run → refresh on ok, else show the message).
  function run(action: () => Promise<InvoiceActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.kind === 'ok') router.refresh();
      else setError(result.message);
    });
  }

  return (
    <div className="no-print" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {status === 'draft' && (
          <button type="button" className="btn" onClick={() => run(() => finalizeInvoiceAction(invoiceId))} disabled={pending}>
            {pending ? 'Finalizing…' : 'Finalize SOA'}
          </button>
        )}

        {status === 'finalized' && (
          <button type="button" className="btn" onClick={() => run(() => markPaidAction(invoiceId))} disabled={pending}>
            {pending ? 'Marking paid…' : 'Mark paid'}
          </button>
        )}

        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => window.print()}
          disabled={pending}
        >
          Print / Save PDF
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert" style={{ marginTop: '0.75rem' }}>
          {error}
        </p>
      )}
    </div>
  );
}
