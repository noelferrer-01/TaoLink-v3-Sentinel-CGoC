'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reattributeDtrDayAction } from './actions';

interface Props {
  dtrEntryId: string;
}

/**
 * Re-attach button for one unattributed worked day (Slice 4, W3). Re-resolves
 * the guard's active posting for that date and stamps it, making the day
 * billable. If the guard still has no posting covering that date the engine
 * rejects it and we show the reason inline next to the button.
 */
export function ReattachButton({ dtrEntryId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await reattributeDtrDayAction(dtrEntryId);
      if (result.kind === 'ok') {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? 'Re-attaching…' : 'Re-attach'}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>
          {error}
        </span>
      )}
    </span>
  );
}
