import { createEmployee, getEmployee, changeStatus, bulkImportEmployees } from './service';
export type { BulkImportResult } from './service';

export const hr = { createEmployee, getEmployee, changeStatus, bulkImportEmployees };
export { createEmployee, getEmployee, changeStatus, bulkImportEmployees };
