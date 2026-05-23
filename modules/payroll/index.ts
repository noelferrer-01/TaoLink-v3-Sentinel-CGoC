import { runPayroll, lockPayRun } from './service';

export const payroll = { runPayroll, lockPayRun };
export { runPayroll, lockPayRun };
export type { PayRun, NewPayRun, Payslip, NewPayslip } from './schema';
export type { PayrollComputeInput, PayrollComputeResult, PayrollRates, PayrollFrequency } from './compute';
