'use client';

import { useEffect, useState, useTransition } from 'react';
import { previewBir2316WarningsAction } from './actions';

export type EmployeeOption = { id: string; label: string };

export function BirPicker({
  employees,
  defaultYear,
}: {
  employees: EmployeeOption[];
  defaultYear: number;
}) {
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? '');
  const [year, setYear] = useState<number>(defaultYear);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [downloadState, setDownloadState] = useState<
    { kind: 'idle' } | { kind: 'fetching' } | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Programmatic Blob download. Anchor-with-Content-Disposition was failing
  // for some Chrome configurations — the browser would intercept the PDF
  // response and render it inline despite `download` + attachment header.
  // Fetching the PDF as a Blob + creating an object URL bypasses Chrome's
  // PDF viewer entirely: the browser only ever sees a blob: URL with
  // `download`, which it reliably saves to ~/Downloads.
  async function handleDownload() {
    if (!employeeId || !Number.isInteger(year)) return;
    setDownloadState({ kind: 'fetching' });
    try {
      const res = await fetch(`/api/exports/bir-2316/${employeeId}/${year}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Server returned ${res.status}`);
      }
      const blob = await res.blob();
      // Prefer the server-suggested filename from Content-Disposition;
      // fall back to the year-only filename if parsing fails.
      const cd = res.headers.get('content-disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `2316-${year}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Release the object URL on the next tick — release-before-click can
      // cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadState({ kind: 'idle' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setDownloadState({ kind: 'error', message });
    }
  }

  // Refresh the warnings preview whenever the (employee, year) pair changes.
  // Debounced via React's transition queue so quick scrubs through the year
  // input don't fire one query per keystroke.
  useEffect(() => {
    if (!employeeId || !Number.isInteger(year)) {
      setWarnings(null);
      return;
    }
    setPreviewError(null);
    startTransition(async () => {
      const result = await previewBir2316WarningsAction(employeeId, year);
      if (result.kind === 'ok') {
        setWarnings(result.warnings);
      } else {
        setPreviewError(result.message);
        setWarnings(null);
      }
    });
  }, [employeeId, year]);

  if (employees.length === 0) {
    return (
      <p style={{ color: 'var(--muted)' }}>
        No employees yet. Import or add at least one employee.
      </p>
    );
  }

  return (
    <div className="form-stack">
      <label className="field">
        <span className="field-label">Employee</span>
        <select
          className="input"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Year</span>
        <input
          className="input"
          type="number"
          min={2020}
          max={2099}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ maxWidth: 140 }}
        />
      </label>

      {warnings && warnings.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            border: '1px solid var(--warning)',
            background: 'rgba(184, 134, 47, 0.06)',
            borderRadius: 'var(--radius)',
            padding: '0.875rem 1rem',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--ff-mono)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontSize: '0.6875rem',
              color: 'var(--warning)',
              marginBottom: '0.5rem',
            }}
          >
            ⚠ Filing-readiness warnings
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.125rem', color: 'var(--ink-soft)', fontSize: '0.875rem' }}>
            {warnings.map((w) => (
              <li key={w} style={{ marginBottom: '0.25rem' }}>{w}</li>
            ))}
          </ul>
          <p style={{ marginTop: '0.625rem', marginBottom: 0, fontSize: '0.8125rem', color: 'var(--muted)' }}>
            The PDF will still download, but blank fields will be blank on the
            printed form. Edit the employee record (or import locked pay runs)
            to fill these in before filing.
          </p>
        </div>
      )}

      {previewError && (
        <p className="form-error" role="alert">
          Couldn&rsquo;t check filing readiness: {previewError}
        </p>
      )}

      {warnings && warnings.length === 0 && !pending && (
        <p
          role="status"
          style={{ color: 'var(--success)', fontSize: '0.875rem', margin: 0 }}
        >
          ✓ All filing-readiness checks pass for this employee &amp; year.
        </p>
      )}

      <button
        type="button"
        className="btn"
        onClick={handleDownload}
        disabled={!employeeId || downloadState.kind === 'fetching'}
        style={{ justifySelf: 'start' }}
      >
        {downloadState.kind === 'fetching'
          ? 'Generating PDF…'
          : 'Download BIR 2316 (PDF) →'}
      </button>
      {downloadState.kind === 'error' && (
        <p className="form-error" role="alert" style={{ marginTop: '0.25rem' }}>
          Couldn&rsquo;t download: {downloadState.message}
        </p>
      )}
      <p className="field-hint" style={{ marginTop: '0.25rem' }}>
        Saves to your computer&rsquo;s Downloads folder. The download succeeds
        even when the warnings above list missing fields — fix them on the
        employee record before filing if any apply.
      </p>
    </div>
  );
}
