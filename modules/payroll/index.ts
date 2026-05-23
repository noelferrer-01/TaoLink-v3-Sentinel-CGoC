import { runPayroll } from './service';

export const payroll = { runPayroll };
export { runPayroll };
export type { PayRun, NewPayRun, Payslip, NewPayslip } from './schema';
export type { PayrollComputeInput, PayrollComputeResult, PayrollRates, PayrollFrequency } from './compute';
