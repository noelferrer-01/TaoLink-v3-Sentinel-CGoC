'use client';

import type React from 'react';

/**
 * ModalShell — backdrop + dialog frame used by every bulk-action modal.
 *
 * Extracted from app/(admin)/assignments/assignments-list-body.tsx so the
 * Bulk-assign modal on /employees can reuse the same chrome. Pattern: card
 * dialog with a title, optional subtitle, scrollable body, and a fixed
 * footer for the primary + cancel buttons.
 *
 * Click-outside the dialog closes via `onClose`. Click-inside is stopped
 * so it doesn't bubble up to the backdrop click.
 */
export function ModalShell({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 16, 10, 0.4)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '5rem 1rem 1rem',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper-card)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 'var(--radius)',
          width: 'min(34rem, calc(100% - 2rem))',
          maxHeight: 'calc(100vh - 6rem)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '1.5rem 1.75rem 1.25rem', overflowY: 'auto' }}>
          <h2
            style={{
              fontFamily: 'var(--ff-display), system-ui, sans-serif',
              fontSize: '1.5rem',
              color: 'var(--navy)',
              margin: '0 0 0.5rem',
              letterSpacing: '-0.012em',
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 1.25rem' }}>{subtitle}</p>
          )}
          {children}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.625rem',
            padding: '1rem 1.75rem 1.25rem',
            borderTop: '1px solid var(--rule)',
            background: 'var(--paper-card)',
          }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}
