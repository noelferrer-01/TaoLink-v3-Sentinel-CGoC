/**
 * Shared form presentation helpers — extracted from previously-duplicated
 * copies in employees + clients detail/edit pages. Use these to render the
 * visual structure of forms and the read-mode of a record.
 *
 * TextField / SelectField support both flavours: pass `value` + `onChange`
 * for controlled use (when a sibling needs to read the value live), or
 * `defaultValue` alone for native uncontrolled form submission. Some older
 * detail/edit pages still carry local copies — migrate them here when those
 * files are next touched, don't add new local copies.
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

interface TextFieldProps {
  label: string; name: string; type?: string; required?: boolean; disabled?: boolean; hint?: string;
  defaultValue?: string;
  // Controlled flavour: pass both to make the field controlled (so its value is
  // readable by siblings, e.g. a "Look up" button). Omit for native uncontrolled behaviour.
  value?: string;
  onChange?: (v: string) => void;
}

/** Labelled text input — `.field` + `.field-label` + `.input` structure, optional hint. */
export function TextField({ label, name, type = 'text', required, disabled, hint, defaultValue, value, onChange }: TextFieldProps) {
  const controlled = value !== undefined && onChange !== undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={`f-${name}`}>
        {label}
        {required && <span aria-hidden style={{ color: 'var(--ochre)', marginLeft: '0.25rem' }}>*</span>}
      </label>
      <input
        id={`f-${name}`} className="input" name={name} type={type} required={required} disabled={disabled}
        autoComplete="off"
        {...(controlled ? { value, onChange: (e) => onChange!(e.target.value) } : { defaultValue })}
      />
      {hint && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{hint}</span>}
    </div>
  );
}

interface SelectFieldProps {
  label: string; name: string; value?: string; defaultValue?: string; options: Array<[string, string]>;
  required?: boolean; disabled?: boolean; onChange?: (v: string) => void; uncontrolled?: boolean;
}

/** Labelled select — options as `[value, label]` pairs. */
export function SelectField({ label, name, value, defaultValue, options, required, disabled, onChange, uncontrolled }: SelectFieldProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={`f-${name}`}>{label}</label>
      <select
        id={`f-${name}`} className="input" name={name} required={required} disabled={disabled}
        {...(uncontrolled ? { defaultValue } : { value, onChange: (e) => onChange?.(e.target.value) })}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}
