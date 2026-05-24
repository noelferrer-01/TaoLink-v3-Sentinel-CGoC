'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ALLOWED_TRANSITIONS, STATUS_LABELS, type Status } from '@/modules/hr/labels';
import { changeStatusAction } from './actions';

interface Props {
  employeeId: string;
  currentStatus: Status;
  open: boolean;
  onClose: () => void;
}

export function ChangeStatusModal({ employeeId, currentStatus, open, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [next, setNext] = useState<string>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const options = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  const isTerminal = options.length === 0;

  // Sync <dialog> open state with the controlled `open` prop.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // Reset internal state when the modal closes
  useEffect(() => {
    if (!open) {
      setNext('');
      setReason('');
      setError(null);
    }
  }, [open]);

  function handleConfirm() {
    setError(null);
    if (!next) {
      setError('Pick a new status from the list.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Add a short reason so the audit log makes sense later.');
      return;
    }
    startTransition(async () => {
      const result = await changeStatusAction(employeeId, next, reason);
      if (result.kind === 'ok') {
        onClose();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        // Prevent the dialog from closing while a request is in-flight.
        if (pending) e.preventDefault();
      }}
      style={{
        border: '1px solid var(--rule-strong)',
        borderRadius: 'var(--radius)',
        padding: 0,
        background: 'var(--paper-card)',
        color: 'var(--ink)',
        maxWidth: '32rem',
        width: 'calc(100% - 2rem)',
      }}
    >
      <div style={{ padding: '1.5rem 1.75rem 1.25rem' }}>
        <h2
          style={{
            fontFamily: 'var(--ff-display), system-ui, sans-serif',
            fontSize: '1.5rem',
            color: 'var(--navy)',
            margin: '0 0 0.5rem',
            letterSpacing: '-0.012em',
          }}
        >
          Change status
        </h2>
        <p style={{ color: 'var(--ink-soft)', margin: '0 0 1.25rem' }}>
          Current status:{' '}
          <span className={`status-pill is-${currentStatus}`}>
            {STATUS_LABELS[currentStatus] ?? currentStatus}
          </span>
        </p>

        {isTerminal ? (
          <p style={{ color: 'var(--ink-soft)', margin: '0 0 1rem' }}>
            This employee is terminated — the status is final and can't be
            changed.
          </p>
        ) : (
          <div className="form-stack">
            <div className="field">
              <label htmlFor="change-status-next" className="field-label">
                New status
              </label>
              <select
                id="change-status-next"
                className="input"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                disabled={pending}
              >
                <option value="">Pick one…</option>
                {options.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="change-status-reason" className="field-label">
                Reason
              </label>
              <textarea
                id="change-status-reason"
                className="input"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this changing? E.g. 'Reassigned from City Hall to SM Megamall.'"
                disabled={pending}
              />
            </div>

            {error && <p className="form-error">{error}</p>}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.625rem',
          padding: '1rem 1.75rem 1.25rem',
          borderTop: '1px solid var(--rule)',
        }}
      >
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onClose}
          disabled={pending}
        >
          {isTerminal ? 'Close' : 'Cancel'}
        </button>
        {!isTerminal && (
          <button
            type="button"
            className="btn"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? 'Saving…' : 'Confirm change'}
          </button>
        )}
      </div>
    </dialog>
  );
}
