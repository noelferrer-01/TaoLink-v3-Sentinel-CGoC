import { createEmployee, getEmployee, listEmployees, changeStatus, bulkImportEmployees } from './service';
export type { BulkImportResult, EmployeeListItem } from './service';

export const hr = { createEmployee, getEmployee, listEmployees, changeStatus, bulkImportEmployees };
export { createEmployee, getEmployee, listEmployees, changeStatus, bulkImportEmployees };
