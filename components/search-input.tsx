'use client';

/**
 * SearchInput — debounced text input with a clear (×) button.
 *
 * - onChange fires after debounceMs (default 250ms) of inactivity
 * - Clear button appears when value is non-empty; click resets to ''
 * - Controlled via value + onChange
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Debounce delay in ms. Defaults to 250. */
  debounceMs?: number;
  /** accessible label — shown to screen readers */
  'aria-label'?: string;
  /** Optional id for <input> */
  id?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  debounceMs = 250,
  'aria-label': ariaLabel = 'Search',
  id,
}: SearchInputProps) {
  // Local display value (updates immediately on keystroke).
  const [local, setLocal] = useState(value);
  // Mirror local into a ref so the useEffect below can compare without re-running on every keystroke.
  const localRef = useRef(local);
  localRef.current = local;

  // Sync down from parent — but only when parent's value diverges from what we last set locally.
  // Reason: during typing, the debounce means parent's `value` lags `local`. We must NOT
  // overwrite `local` in that window. Only react when parent's value differs from local
  // (= external reset, e.g. "Clear filters" button).
  useEffect(() => {
    if (value !== localRef.current) {
      setLocal(value);
    }
  }, [value]);

  // Debounce: fire onChange after delay
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setLocal(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(next);
      }, debounceMs);
    },
    [onChange, debounceMs],
  );

  const handleClear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLocal('');
    onChange('');
  }, [onChange]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: '100%',
      }}
    >
      {/* Search icon */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: '0.75rem',
          color: 'var(--muted)',
          pointerEvents: 'none',
          lineHeight: 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="6.5" cy="6.5" r="5" />
          <line x1="10.5" y1="10.5" x2="15" y2="15" />
        </svg>
      </span>

      <input
        id={id}
        type="search"
        className="input"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={local}
        onChange={handleChange}
        style={{ paddingLeft: '2.25rem', paddingRight: local ? '2.25rem' : undefined, width: '100%' }}
        autoComplete="off"
        spellCheck={false}
      />

      {/* Clear button */}
      {local && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          style={{
            position: 'absolute',
            right: '0.625rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            padding: '0.25rem',
            lineHeight: 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="1" y1="1" x2="11" y2="11" />
            <line x1="11" y1="1" x2="1" y2="11" />
          </svg>
        </button>
      )}
    </div>
  );
}
