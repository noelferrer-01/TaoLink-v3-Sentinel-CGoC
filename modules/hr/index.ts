import {
  createEmployee,
  getEmployee,
  getEmployeeByCode,
  listEmployees,
  changeStatus,
  undoTermination,
  getLatestTerminationTimestamp,
  bulkImportEmployees,
  updateEmployee,
  searchEmployees,
} from './service';
export type { BulkImportResult, EmployeeListItem, SearchEmployeeOptions } from './service';
export {
  STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  PAY_FREQUENCY_LABELS,
  ALLOWED_TRANSITIONS,
  type Status,
  type EmploymentType,
  type PayFrequency,
} from './labels';

export const hr = {
  createEmployee,
  getEmployee,
  getEmployeeByCode,
  listEmployees,
  changeStatus,
  undoTermination,
  getLatestTerminationTimestamp,
  bulkImportEmployees,
  updateEmployee,
  searchEmployees,
};
export {
  createEmployee,
  getEmployee,
  getEmployeeByCode,
  listEmployees,
  changeStatus,
  undoTermination,
  getLatestTerminationTimestamp,
  bulkImportEmployees,
  updateEmployee,
  searchEmployees,
};
