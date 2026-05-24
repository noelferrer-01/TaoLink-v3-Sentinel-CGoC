// Sentinel uses semi-monthly cutoffs: day 1–15 and day 16–end-of-month.
// Period math lives here so the /dtr page and its actions agree on what
// "this period" means.

export type Period = { start: string; end: string; label: string };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildPeriod(year: number, monthIndex: number, half: 'first' | 'second'): Period {
  const monthName = MONTH_NAMES[monthIndex]!;
  if (half === 'first') {
    return {
      start: ymd(new Date(Date.UTC(year, monthIndex, 1))),
      end: ymd(new Date(Date.UTC(year, monthIndex, 15))),
      label: `${monthName} 1–15, ${year}`,
    };
  }
  const last = lastDayOfMonth(year, monthIndex);
  return {
    start: ymd(new Date(Date.UTC(year, monthIndex, 16))),
    end: ymd(new Date(Date.UTC(year, monthIndex, last))),
    label: `${monthName} 16–${last}, ${year}`,
  };
}

export function periodForDate(isoDate: string): Period {
  const d = new Date(isoDate + 'T00:00:00Z');
  const half = d.getUTCDate() <= 15 ? 'first' : 'second';
  return buildPeriod(d.getUTCFullYear(), d.getUTCMonth(), half);
}

export function currentPeriod(): Period {
  return periodForDate(ymd(new Date()));
}

// Returns the previous, current, and next 2 periods so the picker has options.
export function pickerPeriods(): Period[] {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const halfNow: 'first' | 'second' = now.getUTCDate() <= 15 ? 'first' : 'second';

  // Build a sliding window of 5 periods: -2, -1, 0, +1, +2 relative to current.
  const out: Period[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    let m = month;
    let y = year;
    let h: 'first' | 'second' = halfNow;
    let step = offset;
    while (step !== 0) {
      if (step > 0) {
        if (h === 'first') h = 'second';
        else {
          h = 'first';
          m++;
          if (m > 11) { m = 0; y++; }
        }
        step--;
      } else {
        if (h === 'second') h = 'first';
        else {
          h = 'second';
          m--;
          if (m < 0) { m = 11; y--; }
        }
        step++;
      }
    }
    out.push(buildPeriod(y, m, h));
  }
  return out;
}

export function countDays(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}
