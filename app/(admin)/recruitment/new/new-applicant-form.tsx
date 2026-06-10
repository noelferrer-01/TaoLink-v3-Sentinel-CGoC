'use client';

import { useActionState, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
// Import labels from the /labels subpaths (pure constants) — NOT the module
// indexes, which pull server-only DB code into the client bundle.
import { SOURCE_LABELS, MATCH_KIND_LABELS } from '@/modules/recruitment/labels';
import { EMPLOYMENT_TYPE_LABELS } from '@/modules/hr/labels';
import { ANCHOR_ID_LABELS, ID_TYPE_LADDER, checkIdFormat, type AnchorIdType } from '@/modules/persons/labels';
import { TwoCol, TextField, SelectField } from '@/components/form';
import { createApplicantAction, lookupPersonAction, type FormState, type LookupResult } from '../actions';

const SOURCE_OPTIONS = Object.entries(SOURCE_LABELS);
const POSITION_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABELS);
const ID_TYPE_OPTIONS: Array<[string, string]> = [
  ['', '— None yet / add later —'],
  ...ID_TYPE_LADDER.map((t) => [t, ANCHOR_ID_LABELS[t]] as [string, string]),
];
const initialState: FormState = { kind: 'idle' };

export function NewApplicantForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState(createApplicantAction, initialState);

  // Controlled identity fields — the "Look up" button reads these live.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [idType, setIdType] = useState<'' | AnchorIdType>('');
  const [idValue, setIdValue] = useState('');

  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookingUp, startLookup] = useTransition();

  // Advisory only — never blocks the save (matches createIdFormat's contract).
  const idWarning = idType && idValue.trim() ? checkIdFormat(idType, idValue.trim()) : null;
  const canLookUp = firstName.trim().length > 0 && lastName.trim().length > 0;

  function handleLookup() {
    startLookup(async () => {
      setLookup(await lookupPersonAction({ idType, idValue, firstName, lastName, dateOfBirth }));
    });
  }

  const lookupClean =
    lookup && !lookup.knownPerson && lookup.possibleDuplicates.length === 0 && lookup.matches.length === 0;

  return (
    <form action={formAction} className="form-stack" style={{ gap: '1.25rem' }}>
      <TwoCol>
        <TextField label="First name" name="firstName" required disabled={pending} value={firstName} onChange={setFirstName} />
        <TextField label="Last name" name="lastName" required disabled={pending} value={lastName} onChange={setLastName} />
      </TwoCol>

      <TwoCol>
        <TextField label="Middle name (optional)" name="middleName" disabled={pending} />
        <TextField
          label="Date of birth" name="dateOfBirth" type="date" required disabled={pending}
          value={dateOfBirth} onChange={setDateOfBirth}
          hint="Required — it's how we catch duplicate, terminated, and blacklisted matches."
        />
      </TwoCol>

      {/* ── Government ID — optional now, required before hiring ─────────────── */}
      <div className="card" style={{ background: 'var(--paper-2)', display: 'grid', gap: '0.75rem' }}>
        <div>
          <div className="field-label" style={{ margin: 0 }}>Government ID</div>
          <p className="field-hint" style={{ margin: '0.25rem 0 0' }}>
            Optional at intake — but a PhilSys, SSS, or TIN is <strong>required before this person can be hired</strong>.
            PhilSys (national ID) is the best one to capture.
          </p>
        </div>
        <TwoCol>
          <SelectField
            label="ID type" name="idType" value={idType}
            onChange={(v) => setIdType(v as '' | AnchorIdType)} options={ID_TYPE_OPTIONS} disabled={pending}
          />
          <TextField
            label="ID number" name="idValue" disabled={pending || idType === ''}
            value={idValue} onChange={setIdValue}
            hint={idType === '' ? 'Pick an ID type first.' : undefined}
          />
        </TwoCol>
        {idWarning && (
          <p className="field-hint" style={{ color: 'var(--ochre)', margin: 0 }}>⚠ {idWarning}</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--ghost" onClick={handleLookup} disabled={pending || lookingUp || !canLookUp}>
            {lookingUp ? 'Looking up…' : 'Look up — have we seen this person?'}
          </button>
          {!canLookUp && <span className="field-hint">Enter a first and last name first.</span>}
        </div>

        {lookupClean && (
          <p className="field-hint" style={{ color: 'var(--success)', margin: 0 }}>
            ✓ No existing record, possible duplicate, or blacklist match found.
          </p>
        )}

        {lookup?.knownPerson && (
          <Panel tone="info">
            <strong>Already on file:</strong> {lookup.knownPerson.name} ({lookup.knownPerson.anchorLabel}).
            This person already has an identity record — saving will create a new applicant; consider whether this is a re-application.
          </Panel>
        )}

        {lookup && lookup.possibleDuplicates.length > 0 && (
          <Panel tone="warn">
            <strong>Possible existing record{lookup.possibleDuplicates.length > 1 ? 's' : ''}</strong> (same name + date of birth):
            <ul style={{ margin: '0.375rem 0 0', paddingLeft: '1.125rem' }}>
              {lookup.possibleDuplicates.map((p) => (
                <li key={p.id}>{p.name}{p.dateOfBirth ? ` — born ${p.dateOfBirth}` : ''}</li>
              ))}
            </ul>
          </Panel>
        )}

        {lookup && lookup.matches.length > 0 && (
          <Panel tone="danger">
            <strong>⚠ Review before proceeding:</strong>
            <ul style={{ margin: '0.375rem 0 0', paddingLeft: '1.125rem' }}>
              {lookup.matches.map((m, i) => (
                <li key={i}>
                  {MATCH_KIND_LABELS[m.kind]} ({m.confidence === 'exact' ? 'exact match' : 'possible match'}): {m.label}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <TwoCol>
        <SelectField label="Position applied for" name="positionAppliedFor" defaultValue="GUARD" options={POSITION_OPTIONS} disabled={pending} uncontrolled />
        <SelectField label="Where did they apply from?" name="source" defaultValue="walk_in" options={SOURCE_OPTIONS} disabled={pending} uncontrolled />
      </TwoCol>

      <TwoCol>
        <TextField label="Date applied" name="appliedOn" type="date" required disabled={pending} defaultValue={today} />
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-end' }}>
          <input type="checkbox" name="isArmedPost" disabled={pending} />
          <span className="field-label" style={{ margin: 0 }}>Armed post (requires LTOPF firearms license)</span>
        </label>
      </TwoCol>

      <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '0.5rem 0' }} />

      <TwoCol>
        <TextField label="Phone (optional)" name="phone" disabled={pending} />
        <TextField label="Email (optional)" name="email" type="email" disabled={pending} />
      </TwoCol>

      <TwoCol>
        <TextField label="City (optional)" name="city" disabled={pending} />
        <TextField label="Province (optional)" name="province" disabled={pending} />
      </TwoCol>

      <TextField label="Notes (optional)" name="notes" disabled={pending} hint="Anything the recruiter wants to remember." />

      {state.kind === 'error' && (
        <div className="form-error" role="alert">{state.message}</div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Adding…' : 'Add applicant'}
        </button>
        <Link href="/recruitment" className="btn btn--ghost" aria-disabled={pending}
          style={pending ? { pointerEvents: 'none', opacity: 0.5 } : undefined}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

// ─── Local presentation helpers ──────────────────────────────────────────────

function Panel({ tone, children }: { tone: 'info' | 'warn' | 'danger'; children: ReactNode }) {
  const palette = {
    info:   { border: 'var(--navy-soft)', bg: 'rgba(31, 58, 95, 0.06)', color: 'var(--ink-soft)' },
    warn:   { border: 'var(--ochre)', bg: 'rgba(184, 134, 47, 0.10)', color: 'var(--ochre)' },
    danger: { border: 'var(--danger)', bg: 'rgba(139, 46, 31, 0.06)', color: 'var(--ink-soft)' },
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} style={{
      border: `1px solid ${palette.border}`, background: palette.bg, color: palette.color,
      borderRadius: 'var(--radius)', padding: '0.75rem 1rem', fontSize: '0.875rem',
    }}>
      {children}
    </div>
  );
}

