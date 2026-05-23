import { runPayroll, lockPayRun } from './service';
import { initPayrollSubscriptions, _resetPayrollSubscriptionsForTests } from './subscriptions';

export const payroll = { runPayroll, lockPayRun, initPayrollSubscriptions };
export { runPayroll, lockPayRun, initPayrollSubscriptions, _resetPayrollSubscriptionsForTests };
export type { PayRun, NewPayRun, Payslip, NewPayslip } from './schema';
export type { PayrollComputeInput, PayrollComputeResult, PayrollRates, PayrollFrequency } from './compute';
