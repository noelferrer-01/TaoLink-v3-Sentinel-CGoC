'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ModalShell } from '@/components/modal-shell';
import { TextField, SelectField } from '@/components/form';
// Import labels from the /labels subpath (pure constants) — NOT the module
// index, which pulls server-only DB code into the client bundle.
import { ANCHOR_ID_LABELS, ID_TYPE_LADDER, checkIdFormat, type AnchorIdType } from '@/modules/persons/labels';
import { hireAction, type HireState } from '../actions';

const initial: HireState = { kind: 'idle' };

const ID_TYPE_OPTIONS: Array<[string, string]> = [
  ['', '— pick an ID type —'],
  ...ID_TYPE_LADDER.map((t) => [t, ANCHOR_ID_LABELS[t]] as [string, string]),
];

export function HireModal({
  applicantId,
  defaultCode,
  today,
  readyToHire,
  needsId,
}: {
  applicantId: string;
  defaultCode: string;
  today: string;
  readyToHire: boolean;
  needsId: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(hireAction, initial);
  const [idType, setIdType] = useState<'' | AnchorIdType>('');
  const [idValue, setIdValue] = useState('');

  // Advisory only — warns on an odd-looking number, never blocks (same contract as intake).
  const idWarning = needsId && idType && idValue.trim() ? checkIdFormat(idType, idValue.trim()) : null;

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
              {needsId && (
                <div className="card" style={{ background: 'var(--paper-2)', display: 'grid', gap: '0.75rem' }}>
                  <div>
                    <div className="field-label" style={{ margin: 0 }}>Government ID — required to hire</div>
                    <p className="field-hint" style={{ margin: '0.25rem 0 0' }}>
                      This applicant has no government ID on file yet. Enter one here — it&apos;s saved to their identity record as part of the hire.
                    </p>
                  </div>
                  <SelectField
                    label="ID type" name="idType" required options={ID_TYPE_OPTIONS}
                    value={idType} onChange={(v) => setIdType(v as '' | AnchorIdType)}
                  />
                  <TextField
                    label="ID number" name="idValue" required disabled={idType === ''}
                    value={idValue} onChange={setIdValue}
                    hint={idType === '' ? 'Pick an ID type first.' : undefined}
                  />
                  {idWarning && <p className="field-hint" style={{ color: 'var(--ochre)', margin: 0 }}>⚠ {idWarning}</p>}
                </div>
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
