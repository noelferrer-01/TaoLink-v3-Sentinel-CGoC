'use client';

import { useEffect, useState } from 'react';
import { FIVE_MIN_MS } from '@/core/time';

/**
 * Ticking countdown for a 5-minute undo window. Returns `active: false,
 * secondsLeft: 0` when `targetTime` is null or already past the window;
 * otherwise ticks `secondsLeft` once per second and flips `active` to false
 * when it hits 0.
 *
 * Used by employee Undo Termination + client Delete Client buttons.
 */
export function useUndoWindow(
  targetTime: Date | null,
  windowMs: number = FIVE_MIN_MS,
): { active: boolean; secondsLeft: number } {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!targetTime) {
      setSecondsLeft(0);
      return;
    }
    const compute = () => {
      const remaining = windowMs - (Date.now() - targetTime.getTime());
      return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    };
    setSecondsLeft(compute());
    const interval = setInterval(() => {
      const next = compute();
      setSecondsLeft(next);
      if (next <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTime, windowMs]);

  return { active: secondsLeft > 0, secondsLeft };
}

/** Format a count of seconds as "M:SS" — used in the countdown badge. */
export function formatMinSec(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
