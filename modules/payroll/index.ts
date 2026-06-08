import {
  runPayroll,
  lockPayRun,
  getPayslip,
  listPayslips,
  listPayRuns,
  listPayRunsPage,
  getPayRun,
  listPayslipsWithEmployee,
  listPayslipsWithEmployeePage,
  getPayRunTotals,
} from './service';
import { initPayrollSubscriptions, _resetPayrollSubscriptionsForTests } from './subscriptions';

export type {
  PayslipWithEmployee,
  ListPayRunsPageOptions,
  ListPayRunsPageResult,
  ListPayslipsWithEmployeePageOptions,
  ListPayslipsWithEmployeePageResult,
  PayRunTotals,
} from './service';

export const payroll = {
  runPayroll,
  lockPayRun,
  getPayslip,
  listPayslips,
  listPayRuns,
  listPayRunsPage,
  getPayRun,
  listPayslipsWithEmployee,
  listPayslipsWithEmployeePage,
  getPayRunTotals,
  initPayrollSubscriptions,
};
export {
  runPayroll,
  lockPayRun,
  getPayslip,
  listPayslips,
  listPayRuns,
  listPayRunsPage,
  getPayRun,
  listPayslipsWithEmployee,
  listPayslipsWithEmployeePage,
  getPayRunTotals,
  initPayrollSubscriptions,
  _resetPayrollSubscriptionsForTests,
};
export type { PayRun, NewPayRun, Payslip, NewPayslip } from './schema';
export type { PayrollComputeInput, PayrollComputeResult, PayrollRates, PayrollFrequency } from './compute';
