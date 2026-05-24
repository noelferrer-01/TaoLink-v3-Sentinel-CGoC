import {
  assign,
  endAssignment,
  getActiveAssignment,
  listActiveAssignments,
  listAssignmentsOverlappingPeriod,
  listAssignableEmployees,
} from './service';

export type { ActiveAssignmentRow, AssignableEmployee } from './service';

export const assignments = {
  assign,
  endAssignment,
  getActiveAssignment,
  listActiveAssignments,
  listAssignmentsOverlappingPeriod,
  listAssignableEmployees,
};

export {
  assign,
  endAssignment,
  getActiveAssignment,
  listActiveAssignments,
  listAssignmentsOverlappingPeriod,
  listAssignableEmployees,
};
