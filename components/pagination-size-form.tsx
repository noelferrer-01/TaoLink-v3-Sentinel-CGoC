'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { PAGE_SIZE_OPTIONS } from './pagination';

/**
 * Tiny client island for the page-size selector.
 *
 * Pagination itself is a server component (no JS for the readout + Prev/Next).
 * The size dropdown is the one place we need auto-submit-on-change for good
 * UX. Splitting it out keeps the JS payload small.
 *
 * Preserves every other URL search param. Resets ?page to 1 when size
 * changes (otherwise picking size=200 from page=4 of a 50-per-page list
 * could land on an empty page).
 */
export interface PaginationSizeFormProps {
  basePath: string;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
}

export function PaginationSizeForm({ basePath, pageSize, searchParams }: PaginationSizeFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v == null || v === '') continue;
      if (k === 'size' || k === 'page') continue;
      params.set(k, v);
    }
    params.set('size', e.target.value);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath);
    });
  }

  return (
    <div className="pagination__sizer">
      <label htmlFor="pagination-size">Rows per page</label>
      <select id="pagination-size" defaultValue={String(pageSize)} onChange={onChange}>
        {PAGE_SIZE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
