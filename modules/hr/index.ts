import {
  createEmployee,
  getEmployee,
  getEmployeeByCode,
  listEmployees,
  changeStatus,
  bulkImportEmployees,
  updateEmployee,
  searchEmployees,
} from './service';
export type { BulkImportResult, EmployeeListItem, SearchEmployeeOptions } from './service';

export const hr = {
  createEmployee,
  getEmployee,
  getEmployeeByCode,
  listEmployees,
  changeStatus,
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
  bulkImportEmployees,
  updateEmployee,
  searchEmployees,
};
