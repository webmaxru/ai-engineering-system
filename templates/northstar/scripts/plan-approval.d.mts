import type { PlanContract } from "./plan-contract.d.mts";
import type { TaskContract } from "./task-contract.d.mts";

export interface Review {
  id: number;
  state: string;
  submitted_at?: string;
  submittedAt?: string;
  commit_id?: string;
  commit?: { oid?: string };
  user?: { login?: string; type?: string };
  author?: { login?: string; __typename?: string };
}

export interface ApprovalRecord {
  schema: "northstar/plan-approval/1";
  taskId: string;
  contractDigest: string;
  planDigest: string;
  planPr: number;
  planUrl: string;
  reviewId: number;
  reviewer: string;
  reviewedCommit: string;
  baseSha: string;
  approvedAt: string;
  planOnly: true;
  commentAuthor?: string;
}

export declare const APPROVAL_MARKER: string;
export declare const APPROVAL_SCHEMA: "northstar/plan-approval/1";
export declare function latestReviewsByUser(reviews: Review[]): Review[];
export declare function isHumanApproval(
  review: Review,
  context?: { prAuthor?: string; headSha?: string },
): boolean;
export declare function parseApprovalRecord(body: unknown): ApprovalRecord | null;
export declare function renderApprovalRecord(record: ApprovalRecord): string;
export declare function evaluatePlanApproval(input: {
  plan: PlanContract;
  contract: TaskContract;
  approvalRecords: ApprovalRecord[];
  reviews: Review[];
  prAuthor: string;
  planHeadSha?: string;
  baseSha: string;
  planOnlyCommits?: string[];
}):
  | { ok: true; record: ApprovalRecord; review: Review }
  | { ok: false; reason: string };
export declare function evaluateFinalApproval(input: {
  reviews: Review[];
  prAuthor: string;
  headSha: string;
  minimum?: number;
}): {
  ok: boolean;
  approvals: Review[];
  reason: string;
};
