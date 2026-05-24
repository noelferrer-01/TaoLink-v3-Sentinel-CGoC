import {
  assign,
  endAssignment,
  getActiveAssignment,
  listActiveAssignments,
  listAssignableEmployees,
} from './service';

export type { ActiveAssignmentRow, AssignableEmployee } from './service';

export const assignments = {
  assign,
  endAssignment,
  getActiveAssignment,
  listActiveAssignments,
  listAssignableEmployees,
};

export {
  assign,
  endAssignment,
  getActiveAssignment,
  listActiveAssignments,
  listAssignableEmployees,
};
