import { request, decide, status } from './service';

export const approvals = { request, decide, status };

export type {
  ApprovalRule,
  ApprovalDecisionValue,
  ApprovalStatus,
  RequestApprovalArgs,
} from './service';
