import {
  recordDTR,
  getDTR,
  closePeriod,
  isPeriodClosed,
  summarizePeriod,
  bulkFillWorked,
} from './service';
import { WORKED_DTR_STATUSES } from './schema';

export type { PeriodSummary } from './service';

export const dtr = {
  recordDTR,
  getDTR,
  closePeriod,
  isPeriodClosed,
  summarizePeriod,
  bulkFillWorked,
  WORKED_DTR_STATUSES,
};
export {
  recordDTR,
  getDTR,
  closePeriod,
  isPeriodClosed,
  summarizePeriod,
  bulkFillWorked,
  WORKED_DTR_STATUSES,
};
