'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ModalShell } from '@/components/modal-shell';
import { hireAction, type HireState } from '../actions';

const initial: HireState = { kind: 'idle' };

export function HireModal({
  applicantId,
  defaultCode,
  today,
  readyToHire,
}: {
  applicantId: string;
  defaultCode: string;
  today: string;
  readyToHire: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(hireAction, initial);

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Hire →
      </button>

      {open && (
        <ModalShell
          title="Hire this applicant"
          subtitle="This creates their employee record in HR. They won't be paid until they're deployed to a detachment and their attendance is recorded."
          onClose={() => (pending ? undefined : setOpen(false))}
          footer={
            state.kind === 'ok' ? (
              <button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>
            ) : (
              <>
                <button type="button" className="btn btn--ghost" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" form="hire-form" className="btn" disabled={pending}>
                  {pending ? 'Hiring…' : 'Confirm hire'}
                </button>
              </>
            )
          }
        >
          {state.kind === 'ok' ? (
            <div className="form-stack">
              <p style={{ color: 'var(--success)', margin: 0 }}>
                ✓ Hired as <strong>{state.employeeCode}</strong>.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link href={`/employees/${state.employeeId}`} className="btn">View employee →</Link>
                <Link href="/assignments" className="btn btn--ghost">Assign to a detachment →</Link>
              </div>
            </div>
          ) : (
            <form id="hire-form" action={formAction} className="form-stack" style={{ gap: '1rem' }}>
              <input type="hidden" name="applicantId" value={applicantId} />
              {!readyToHire && (
                <p style={{ color: 'var(--warning)', fontSize: '0.875rem', margin: 0 }}>
                  Note: not all required documents are verified yet. You can still hire, but finish the clearances before filing.
                </p>
              )}
              <div className="field">
                <label className="field-label" htmlFor="h-code">Employee code</label>
                <input id="h-code" name="employeeCode" className="input" defaultValue={defaultCode} />
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Auto-generated next code — change only if needed.</span>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="h-salary">Monthly basic salary (₱)</label>
                <input id="h-salary" name="basicSalary" type="number" className="input" placeholder="e.g. 18000" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="h-hired">Date hired</label>
                <input id="h-hired" name="hiredOn" type="date" className="input" defaultValue={today} />
              </div>
              {state.kind === 'error' && <div className="form-error" role="alert">{state.message}</div>}
            </form>
          )}
        </ModalShell>
      )}
    </>
  );
}
