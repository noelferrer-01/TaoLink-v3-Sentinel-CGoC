import {
  recordDTR,
  getDTR,
  closePeriod,
  isPeriodClosed,
  summarizePeriod,
  bulkFillWorked,
  billedDaysByEmployeeDetachment,
  listUnattributedWorkedDays,
  reattributeDtrDay,
} from './service';
import { WORKED_DTR_STATUSES } from './schema';

export type { PeriodSummary, BilledDays, UnattributedDay } from './service';

export const dtr = {
  recordDTR,
  getDTR,
  closePeriod,
  isPeriodClosed,
  summarizePeriod,
  bulkFillWorked,
  billedDaysByEmployeeDetachment,
  listUnattributedWorkedDays,
  reattributeDtrDay,
  WORKED_DTR_STATUSES,
};
export {
  recordDTR,
  getDTR,
  closePeriod,
  isPeriodClosed,
  summarizePeriod,
  bulkFillWorked,
  billedDaysByEmployeeDetachment,
  listUnattributedWorkedDays,
  reattributeDtrDay,
  WORKED_DTR_STATUSES,
};
