import {
  create,
  update,
  list,
  getForClient,
  resolveForPeriod,
} from './service';

export {
  create,
  update,
  list,
  getForClient,
  resolveForPeriod,
  type PayrollCalendar,
  type NewPayrollCalendar,
  type ResolvedCalendar,
} from './service';

/**
 * Namespaced entry point — mirrors how other modules (e.g. `clients`, `hr`) export.
 * Lets callers do `import { payrollCalendars } from '@/modules/payroll-calendars'`
 * and then `payrollCalendars.list()`.
 */
export const payrollCalendars = {
  create,
  update,
  list,
  getForClient,
  resolveForPeriod,
};
