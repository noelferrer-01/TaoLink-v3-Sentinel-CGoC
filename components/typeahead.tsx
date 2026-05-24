'use client';

/**
 * Typeahead — generic server-backed combobox using downshift.
 *
 * Features:
 * - Generic over T (any option type)
 * - fetchOptions(query) is called (debounced) after each keystroke
 * - Keyboard navigation: ↑/↓ moves highlight, Enter selects, Esc closes
 * - Uses downshift useCombobox for accessibility + ARIA wiring
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCombobox } from 'downshift';

export interface TypeaheadProps<T> {
  /** Called with the current query; returns matching options. */
  fetchOptions: (query: string) => Promise<T[]>;
  /** Returns the display string for each option. */
  itemToString: (item: T | null) => string;
  /** Called when the user selects an item. */
  onSelect: (item: T | null) => void;
  /** Controlled selected value */
  selectedItem?: T | null;
  /** Renders a dropdown list item. Receives item + highlighted flag. */
  renderItem?: (item: T, highlighted: boolean) => React.ReactNode;
  placeholder?: string;
  /** Minimum chars before fetchOptions is triggered. Defaults to 2. */
  minChars?: number;
  /** Debounce delay in ms. Defaults to 250. */
  debounceMs?: number;
  /** accessible label */
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
}

export function Typeahead<T>({
  fetchOptions,
  itemToString,
  onSelect,
  selectedItem: controlledSelectedItem,
  renderItem,
  placeholder = 'Type to search…',
  minChars = 2,
  debounceMs = 250,
  'aria-label': ariaLabel = 'Search',
  id,
  disabled,
}: TypeaheadProps<T>) {
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerFetch = useCallback(
    (query: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (query.length < minChars) {
        setOptions([]);
        return;
      }
      timerRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const results = await fetchOptions(query);
          setOptions(results);
        } finally {
          setLoading(false);
        }
      }, debounceMs);
    },
    [fetchOptions, minChars, debounceMs],
  );

  // When minChars=0 the user expects to see the full list on first focus —
  // pre-load options once on mount so the dropdown isn't an empty "No results"
  // shell until the first keystroke. Runs once: callers using minChars=0 should
  // pass a stable fetchOptions or accept the closure captured at mount time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (minChars !== 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const results = await fetchOptions('');
        if (!cancelled) setOptions(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    isOpen,
    getMenuProps,
    getInputProps,
    getItemProps,
    highlightedIndex,
    inputValue,
  } = useCombobox<T>({
    items: options,
    itemToString,
    selectedItem: controlledSelectedItem ?? null,
    onSelectedItemChange: ({ selectedItem: item }) => {
      onSelect(item ?? null);
    },
    onInputValueChange: ({ inputValue: query = '' }) => {
      triggerFetch(query);
    },
    // Without this reducer, clicking the input fires focus → opens menu, then
    // the same click is interpreted by downshift as a toggle → closes menu.
    // Net: first click is a flicker. Force InputClick to always open.
    stateReducer: (_state, { type, changes }) => {
      switch (type) {
        case useCombobox.stateChangeTypes.InputClick:
          return { ...changes, isOpen: true };
        default:
          return changes;
      }
    },
  });

  const showDropdown = isOpen && (loading || options.length > 0 || inputValue.length >= minChars);

  return (
    <div style={{ position: 'relative' }} data-testid="typeahead">
      <div style={{ position: 'relative' }}>
        <input
          {...getInputProps({
            id,
            disabled,
            placeholder,
            'aria-label': ariaLabel,
            className: 'input',
            style: { width: '100%', paddingRight: '2.25rem' },
          })}
        />
        {/* Chevron indicator */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: '0.9rem',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: 'var(--muted)',
          }}
        >
          {loading ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
              <path d="M7 1a6 6 0 1 1-6 6" />
            </svg>
          ) : (
            <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
              <path d="M0 0h10L5 6z" />
            </svg>
          )}
        </span>
      </div>

      <ul
        {...getMenuProps()}
        style={{
          display: showDropdown ? 'block' : 'none',
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 50,
          listStyle: 'none',
          margin: '2px 0 0',
          padding: 0,
          background: 'var(--paper-card)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 4px 12px rgba(20, 16, 10, 0.12)',
          maxHeight: '14rem',
          overflowY: 'auto',
        }}
      >
        {loading && (
          <li style={{ padding: '0.625rem 1rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
            Searching…
          </li>
        )}
        {!loading && options.length === 0 && inputValue.length >= minChars && (
          <li style={{ padding: '0.625rem 1rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
            No results found
          </li>
        )}
        {!loading &&
          options.map((item, index) => {
            const itemProps = getItemProps({ item, index });
            return (
              <li
                key={itemToString(item) + String(index)}
                {...itemProps}
                style={{
                  padding: '0.625rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.9375rem',
                  background: highlightedIndex === index ? 'rgba(184, 134, 47, 0.10)' : undefined,
                  color: 'var(--ink)',
                  borderBottom: index < options.length - 1 ? '1px solid var(--rule)' : undefined,
                }}
              >
                {renderItem ? renderItem(item, highlightedIndex === index) : itemToString(item)}
              </li>
            );
          })}
        {!loading && options.length > 0 && (
          <li
            style={{
              padding: '0.375rem 1rem',
              fontSize: '0.75rem',
              color: 'var(--muted)',
              fontFamily: 'var(--ff-mono, monospace)',
              borderTop: '1px solid var(--rule)',
              background: 'var(--paper-2)',
            }}
          >
            ↑↓ navigate · ↵ select · Esc close
          </li>
        )}
      </ul>
    </div>
  );
}
