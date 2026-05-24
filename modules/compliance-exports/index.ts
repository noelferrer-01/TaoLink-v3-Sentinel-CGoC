import { exportSSS_R3 } from './sss-r3';
import { exportBIR_2316 } from './bir-2316';
export { computeYtd } from './ytd';

export const complianceExports = { exportSSS_R3, exportBIR_2316 };
export { exportSSS_R3, exportBIR_2316 };
export type { SSS_R3_Export } from './sss-r3';
export type { Bir2316Result, BIR2316Export } from './bir-2316';
export type { YtdAggregate } from './ytd';
