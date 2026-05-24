'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { importCSV, type ImportState } from './actions';

const initialState: ImportState = { kind: 'idle' };

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importCSV, initialState);

  return (
    <>
      <form action={formAction} className="form-stack" encType="multipart/form-data">
        <label className="field">
          <span className="field-label">Choose CSV file</span>
          <input
            className="input"
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
          />
          <p className="field-hint">
            Need a template?{' '}
            <Link href="/hr-employees-sample.csv" download>
              Download a 10-row sample
            </Link>{' '}
            to see the exact column names Sentinel expects.
          </p>
        </label>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Importing…' : 'Import guards'}
        </button>
      </form>

      {state.kind === 'error' ? (
        <p className="form-error" role="alert" style={{ marginTop: '1rem' }}>
          {state.message}
        </p>
      ) : null}

      {state.kind === 'done' ? (
        <div className="card import-result" role="status" aria-live="polite">
          <div className="import-result-summary">
            <strong className="numeric">{state.imported}</strong>
            <span>
              {state.imported === 1 ? 'guard imported.' : 'guards imported.'}
            </span>
          </div>

          {state.errors.length > 0 ? (
            <>
              <p style={{ marginTop: '1rem' }}>
                <strong>{state.errors.length}</strong>{' '}
                {state.errors.length === 1 ? 'row' : 'rows'} had problems and{' '}
                {state.errors.length === 1 ? 'was' : 'were'} skipped. Fix the
                rows below in your CSV and import again.
              </p>
              <ul className="error-list">
                {state.errors.map((e) => (
                  <li key={`${e.row}-${e.reason}`}>
                    <span className="row-label">Row {e.row}</span>
                    <span>{e.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ marginTop: '0.75rem', color: 'var(--ink-soft)' }}>
              Every row checked out. You can view the new guards on the{' '}
              <Link
                href="/employees"
                style={{ color: 'var(--navy)', textDecoration: 'underline' }}
              >
                Guards page
              </Link>
              .
            </p>
          )}
        </div>
      ) : null}
    </>
  );
}
