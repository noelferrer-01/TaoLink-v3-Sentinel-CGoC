import {
  assign,
  endAssignment,
  getActiveAssignment,
  listActiveAssignments,
  listAssignmentsOverlappingPeriod,
  listAssignableEmployees,
  bulkAssign,
  bulkEndAssignments,
  bulkTransfer,
  updateAssignment,
  list,
} from './service';

export type {
  ActiveAssignmentRow,
  AssignableEmployee,
  BulkAssignResult,
  BulkEndResult,
  BulkTransferResult,
  UpdateAssignmentPatch,
  ListAssignmentsOptions,
  ListAssignmentsResult,
} from './service';

export const assignments = {
  assign,
  endAssignment,
  getActiveAssignment,
  listActiveAssignments,
  listAssignmentsOverlappingPeriod,
  listAssignableEmployees,
  bulkAssign,
  bulkEndAssignments,
  bulkTransfer,
  updateAssignment,
  list,
};

export {
  assign,
  endAssignment,
  getActiveAssignment,
  listActiveAssignments,
  listAssignmentsOverlappingPeriod,
  listAssignableEmployees,
  bulkAssign,
  bulkEndAssignments,
  bulkTransfer,
  updateAssignment,
  list,
};
