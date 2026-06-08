import Link from 'next/link';

/**
 * Pagination — small shared control for paginated list pages.
 *
 * Renders nothing when total <= pageSize. Otherwise renders a plain-language
 * range readout ("Showing 1–50 of 90 · page 1 of 2") + Prev / Next links that
 * carry forward all other URL params (so search + filter survive paging).
 *
 * Used by /assignments and /employees (Slice 2 contract criterion #7;
 * #2 implies pagination at scale). Server components only.
 */
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
  if (total <= pageSize && page === 1) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const unit = total === 1 ? unitLabel : `${unitLabel}s`;

  function hrefForPage(targetPage: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v != null && v !== '' && k !== 'page') params.set(k, v);
    }
    if (targetPage > 1) params.set('page', String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <nav className="pagination" aria-label="Pagination">
      <div className="pagination__readout">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of <strong>{total}</strong> {unit}
        {pageCount > 1 ? <> · page {page} of {pageCount}</> : null}
      </div>
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
