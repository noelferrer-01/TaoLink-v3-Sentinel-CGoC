/**
 * PageShell — standard admin page wrapper.
 *
 * Every admin page = Fraunces (display font) page title + plain-language description
 * + body content + optional next-action footer hint.
 *
 * Usage:
 *   <PageShell
 *     breadcrumb="Sentinel · Operations"
 *     title="Employees"
 *     description="All people on the CGoC payroll — guards, office staff, supervisors."
 *     footerHint="Select rows to bulk-assign, or click a row to view details."
 *   >
 *     {children}
 *   </PageShell>
 *
 * This is a server component — no 'use client' directive. Client children are fine.
 */

import type { ReactNode } from 'react';

export interface PageShellProps {
  /** e.g. "Sentinel · Operations" */
  breadcrumb?: string;
  /** Page title — rendered in Fraunces (display font) */
  title: string;
  /** One or two sentence plain-language description */
  description?: string;
  /** Optional right-side toolbar content (buttons, etc.) */
  toolbar?: ReactNode;
  /** Main page body */
  children: ReactNode;
  /** Footer next-action hint — clerk-friendly, workflow-oriented copy */
  footerHint?: string;
}

export function PageShell({
  breadcrumb,
  title,
  description,
  toolbar,
  children,
  footerHint,
}: PageShellProps) {
  return (
    <>
      <header className="page-header">
        {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <h1 className="page-title">{title}</h1>
          {toolbar && (
            <div className="page-toolbar-actions" style={{ marginTop: '0.25rem', flexShrink: 0 }}>
              {toolbar}
            </div>
          )}
        </div>
        {description && <p className="page-sub">{description}</p>}
      </header>

      {children}

      {footerHint && (
        <footer className="footnote" style={{ marginTop: '3rem' }}>
          {footerHint}
        </footer>
      )}
    </>
  );
}
