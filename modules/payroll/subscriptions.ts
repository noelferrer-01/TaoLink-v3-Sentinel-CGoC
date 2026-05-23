import { events } from '@/modules/events';
import { runPayroll } from './service';

/**
 * Idempotent — calling twice safely no-ops the second time because we track
 * whether we already subscribed for this process.
 */
let unsubscribe: (() => void) | null = null;

export function initPayrollSubscriptions(): void {
  if (unsubscribe !== null) return;
  unsubscribe = events.subscribe('dtr.period.closed', async (payload) => {
    const rawStart = payload['periodStart'];
    const rawEnd = payload['periodEnd'];
    if (typeof rawStart !== 'string' || !rawStart || typeof rawEnd !== 'string' || !rawEnd) {
      // eslint-disable-next-line no-console
      console.error('[payroll/subscriptions] dtr.period.closed missing periodStart/periodEnd:', payload);
      return;
    }
    await runPayroll(rawStart, rawEnd);
  });
}

/** Test helper — undoes initPayrollSubscriptions so tests can call init again cleanly. */
export function _resetPayrollSubscriptionsForTests(): void {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
}
