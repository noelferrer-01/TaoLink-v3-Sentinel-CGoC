import {
  createEmployee,
  getEmployee,
  getEmployeeByCode,
  getEmployeeWithIdentity,
  getEmployeesWithIdentityPage,
  listEmployees,
  listEmployeesPage,
  changeStatus,
  undoTermination,
  getLatestTerminationTimestamp,
  bulkImportEmployees,
  updateEmployee,
  searchEmployees,
  generateNextEmployeeCode,
  IDENTITY_FIELDS,
} from './service';

// The employees table object + row types are public for cross-module JOINs
// (assignments, payroll, compliance-exports) and typed UI props. Runtime code
// must import them from HERE, not from hr/schema — schema.ts deep imports are
// reserved for FK declarations in other modules' schema files.
export { employees } from './schema';
export type { Employee, NewEmployee } from './schema';
export type {
  BulkImportResult,
  EmployeeListItem,
  EmployeeWithIdentity,
  SearchEmployeeOptions,
  SearchEmployeeResult,
  ListEmployeesPageOptions,
  ListEmployeesPageResult,
  GetEmployeesWithIdentityPageOptions,
  GetEmployeesWithIdentityPageResult,
} from './service';
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
  getEmployeeWithIdentity,
  getEmployeesWithIdentityPage,
  listEmployees,
  listEmployeesPage,
  changeStatus,
  undoTermination,
  getLatestTerminationTimestamp,
  bulkImportEmployees,
  updateEmployee,
  searchEmployees,
  generateNextEmployeeCode,
};
export {
  createEmployee,
  getEmployee,
  getEmployeeByCode,
  getEmployeeWithIdentity,
  getEmployeesWithIdentityPage,
  listEmployees,
  listEmployeesPage,
  changeStatus,
  undoTermination,
  getLatestTerminationTimestamp,
  bulkImportEmployees,
  updateEmployee,
  searchEmployees,
  generateNextEmployeeCode,
  IDENTITY_FIELDS,
};
