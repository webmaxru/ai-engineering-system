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

interface ApprovalFields {
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
}
export interface LegacyApprovalRecord extends ApprovalFields {
  schema: "northstar/plan-approval/1";
  commentAuthor?: string;
}
export interface NativeApprovalRecord extends ApprovalFields {
  schema: "northstar/plan-approval/2";
  source: "github-review";
  repository: string;
  artifactPath: string;
  artifactBlobSha: string;
}
export type ApprovalRecord = LegacyApprovalRecord | NativeApprovalRecord;

export declare const APPROVAL_MARKER: string;
export declare const APPROVAL_SCHEMA: "northstar/plan-approval/1";
export declare const NATIVE_APPROVAL_SCHEMA: "northstar/plan-approval/2";
export declare function latestReviewsByUser(reviews: Review[]): Review[];
export declare function isHumanApproval(
  review: Review,
  context?: { prAuthor?: string; headSha?: string },
): boolean;
export declare function parseApprovalRecord(body: unknown): LegacyApprovalRecord | null;
export declare function renderApprovalRecord(record: LegacyApprovalRecord): string;
export declare function evaluatePlanApproval(input: {
  plan: PlanContract;
  contract: TaskContract;
  approvalRecords: LegacyApprovalRecord[];
  reviews: Review[];
  prAuthor: string;
  planHeadSha?: string;
  baseSha: string;
  planOnlyCommits?: string[];
}):
  | { ok: true; record: LegacyApprovalRecord; review: Review }
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
export declare function evaluateNativePlanApproval(input: {
  plan: PlanContract;
  contract: TaskContract;
  pr: import("./publish-plan.d.mts").PlanPr;
  reviews: Review[];
  files: import("./plan-artifact.d.mts").PlanFileChange[];
  entry: import("./plan-artifact.d.mts").PlanTreeEntry;
  eligibleReviewers: string[];
  repository: string;
}): { ok: true; record: NativeApprovalRecord; review: Review } | { ok: false; reason: string };
