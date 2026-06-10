/**
 * CountdownBadge — small server-rendered pill showing a target date plus
 * relative-day language ("3 days away", "today", "2 days ago"). Color-banded:
 *
 *   - past:           danger  (overdue — alert the clerk)
 *   - today / +1d:    warning (do-it-now)
 *   - +2d to +5d:     ink (normal)
 *   - +6d or further: muted  (calm, not yet urgent)
 *
 * Used by /dtr (cut-off + payday) and /payroll (payday). Pure presentation —
 * no client state required.
 */

type Props = {
  label: string;
  dueDate: Date;
  /** ISO date string (YYYY-MM-DD) representing the reference "now". */
  today: string;
  /**
   * How to render a past date. 'overdue' = red "N days ago" (default, right for
   * things still owed like a missed cut-off). 'done' = green "✓ on <date>" for
   * dates that simply passed in the normal course (e.g. a cut-off that's
   * already been closed). Choose based on whether the page also knows the
   * operation has been completed.
   */
  pastVariant?: 'overdue' | 'done';
};

function startOfDayUtc(isoOrDate: string | Date): number {
  const d = typeof isoOrDate === 'string'
    ? new Date(isoOrDate + 'T00:00:00Z')
    : new Date(Date.UTC(isoOrDate.getUTCFullYear(), isoOrDate.getUTCMonth(), isoOrDate.getUTCDate()));
  return d.getTime();
}

function relativeDaysCopy(daysDelta: number): string {
  if (daysDelta === 0) return 'today';
  if (daysDelta === 1) return 'tomorrow';
  if (daysDelta === -1) return 'yesterday';
  if (daysDelta > 1) return `in ${daysDelta} days`;
  return `${Math.abs(daysDelta)} days ago`;
}

function colorFor(daysDelta: number, pastVariant: 'overdue' | 'done'): { fg: string; border: string; bg: string } {
  if (daysDelta < 0) {
    if (pastVariant === 'done') {
      return { fg: 'var(--success)', border: 'var(--success)', bg: 'rgba(46, 93, 59, 0.06)' };
    }
    return { fg: 'var(--danger)', border: 'var(--danger)', bg: 'rgba(139, 46, 31, 0.06)' };
  }
  if (daysDelta <= 1) {
    return { fg: 'var(--warning)', border: 'var(--warning)', bg: 'rgba(184, 134, 47, 0.08)' };
  }
  if (daysDelta <= 5) {
    return { fg: 'var(--ink-soft)', border: 'var(--rule-strong)', bg: 'transparent' };
  }
  return { fg: 'var(--muted)', border: 'var(--rule)', bg: 'transparent' };
}

export function CountdownBadge({ label, dueDate, today, pastVariant = 'overdue' }: Props) {
  const daysDelta = Math.round(
    (startOfDayUtc(dueDate) - startOfDayUtc(today)) / (1000 * 60 * 60 * 24),
  );
  const c = colorFor(daysDelta, pastVariant);
  const dueLabel = dueDate.toISOString().slice(0, 10);
  const relCopy =
    daysDelta < 0 && pastVariant === 'done' ? '✓' : relativeDaysCopy(daysDelta);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '0.5rem',
        padding: '0.375rem 0.75rem',
        border: `1px solid ${c.border}`,
        borderRadius: 'var(--radius)',
        background: c.bg,
        fontSize: '0.8125rem',
        lineHeight: 1.2,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--ff-mono)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: '0.6875rem',
          color: 'var(--muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--ff-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: c.fg,
        }}
      >
        {dueLabel}
      </span>
      <span style={{ color: c.fg, fontWeight: 500 }}>{relCopy}</span>
    </span>
  );
}
