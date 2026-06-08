import Link from 'next/link';
import { PaginationSizeForm } from './pagination-size-form';

/**
 * Pagination — shared control for paginated list pages.
 *
 * Renders a plain-language range readout ("Showing 1–50 of 90 · page 1 of 2")
 * + a page-size <select> (25/50/100/200) + Prev / Next links. The dropdown
 * is a plain form GET to the same path so it works without client-side JS.
 *
 * URL params used:
 *   ?page=N   — 1-based page index (default 1)
 *   ?size=N   — rows per page; must be one of PAGE_SIZE_OPTIONS
 *
 * Used by /assignments, /employees, /clients, client detail (detachments),
 * /payroll, and pay-run detail (payslips). Server components only.
 */

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSizeOption = 50;

/**
 * Clamp a raw `?size` URL param to one of the allowlisted options.
 * Returns DEFAULT_PAGE_SIZE for anything missing / invalid / out-of-list.
 * Centralised here so every page hits the same allowlist (DoS guard).
 */
export function clampPageSize(raw: string | undefined): PageSizeOption {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? (n as PageSizeOption)
    : DEFAULT_PAGE_SIZE;
}

export interface PaginationProps {
  total: number;
  page: number;       // 1-based
  pageSize: number;
  /** All URL search params for the current page, so we can preserve them in prev/next links. */
  searchParams: Record<string, string | undefined>;
  /** Used as the link href base, e.g. "/assignments". */
  basePath: string;
  /** Optional label for the singular unit ("assignment", "employee"). Defaults to "row". */
  unitLabel?: string;
}

export function Pagination({
  total,
  page,
  pageSize,
  searchParams,
  basePath,
  unitLabel = 'row',
}: PaginationProps) {
  if (total === 0) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const unit = total === 1 ? unitLabel : `${unitLabel}s`;

  /** Preserve current search params, override the named keys, drop empties. */
  function buildQuery(overrides: Record<string, string | null>): string {
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v == null || v === '') continue;
      if (k in overrides) continue; // overridden below
      out.set(k, v);
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (v != null && v !== '') out.set(k, v);
    }
    return out.toString();
  }

  function hrefForPage(targetPage: number): string {
    const qs = buildQuery({ page: targetPage > 1 ? String(targetPage) : null });
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <nav className="pagination" aria-label="Pagination">
      <div className="pagination__readout">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of <strong>{total}</strong> {unit}
        {pageCount > 1 ? <> · page {page} of {pageCount}</> : null}
      </div>

      <PaginationSizeForm
        basePath={basePath}
        pageSize={pageSize}
        searchParams={searchParams}
      />

      <div className="pagination__controls">
        {page > 1 ? (
          <Link href={hrefForPage(page - 1)} className="btn btn--ghost btn--sm" prefetch={false}>
            ← Prev
          </Link>
        ) : (
          <span className="btn btn--ghost btn--sm is-disabled" aria-disabled="true">← Prev</span>
        )}
        {page < pageCount ? (
          <Link href={hrefForPage(page + 1)} className="btn btn--ghost btn--sm" prefetch={false}>
            Next →
          </Link>
        ) : (
          <span className="btn btn--ghost btn--sm is-disabled" aria-disabled="true">Next →</span>
        )}
      </div>
    </nav>
  );
}
