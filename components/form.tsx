/**
 * Shared form presentation helpers — extracted from previously-duplicated
 * copies in employees + clients detail/edit pages. Pure presentational; no
 * controlled/uncontrolled distinction. Use these to render the visual
 * structure of forms and the read-mode of a record.
 *
 * Pages that need form inputs (TextField, SelectField) currently keep those
 * local — their controlled (detail/edit) vs uncontrolled (native form
 * submission) implementations differ enough that one component with prop
 * unions becomes harder to read than two small wrappers. The shared
 * structure here is the `.field` + `.field-label` + `.input` CSS, which is
 * the real source of cross-page consistency.
 */

import type { ReactNode } from 'react';

/**
 * View-mode label/value pair — used inside a `<dl>` in detail pages.
 * Renders the label in the standard mono-uppercase chip and the value in
 * regular body text.
 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="field-label" style={{ marginBottom: '0.25rem' }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--ink)' }}>
        {children}
      </dd>
    </div>
  );
}

/** Inline muted text — for "—", "Not set", "Uses global default" placeholders. */
export function Muted({ children }: { children: ReactNode }) {
  return <span style={{ color: 'var(--muted)' }}>{children}</span>;
}

/**
 * Responsive 2-column grid for form rows or view-mode field pairs. Collapses
 * to 1 column under ~28rem total width via `auto-fit minmax(14rem, 1fr)`.
 */
export function TwoCol({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
        gap: '1rem',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Edit-mode read-only "field" — shows a value styled like an input box but
 * not editable, with an optional hint underneath. Used when a value is shown
 * in the form (so users know it's there) but isn't editable from this surface
 * (e.g. status with its own dedicated change-flow, employee code which is
 * immutable).
 */
export function ReadOnlyField({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div
        style={{
          padding: '0.625rem 0.75rem',
          background: 'var(--paper-2)',
          color: 'var(--ink-soft)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          fontFamily: mono ? 'var(--ff-mono), monospace' : 'inherit',
          fontSize: '0.9375rem',
        }}
      >
        {value}
      </div>
      {hint && (
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{hint}</span>
      )}
    </div>
  );
}
