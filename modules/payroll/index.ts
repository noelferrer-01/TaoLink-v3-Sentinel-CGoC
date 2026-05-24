import {
  runPayroll,
  lockPayRun,
  getPayslip,
  listPayslips,
  listPayRuns,
  getPayRun,
  listPayslipsWithEmployee,
} from './service';
import { initPayrollSubscriptions, _resetPayrollSubscriptionsForTests } from './subscriptions';

export type { PayslipWithEmployee } from './service';

export const payroll = {
  runPayroll,
  lockPayRun,
  getPayslip,
  listPayslips,
  listPayRuns,
  getPayRun,
  listPayslipsWithEmployee,
  initPayrollSubscriptions,
};
export {
  runPayroll,
  lockPayRun,
  getPayslip,
  listPayslips,
  listPayRuns,
  getPayRun,
  listPayslipsWithEmployee,
  initPayrollSubscriptions,
  _resetPayrollSubscriptionsForTests,
};
export type { PayRun, NewPayRun, Payslip, NewPayslip } from './schema';
export type { PayrollComputeInput, PayrollComputeResult, PayrollRates, PayrollFrequency } from './compute';
