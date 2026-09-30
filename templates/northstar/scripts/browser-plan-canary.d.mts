import type { ApprovalRecord } from "./plan-approval.d.mts";
import type { PlanContract } from "./plan-contract.d.mts";
import type { PlanPr } from "./publish-plan.d.mts";
import type { TaskContract } from "./task-contract.d.mts";

export interface BrowserPlanCanaryEvidence {
  schema: "northstar/browser-plan-canary/1";
  criterionIds: ["AC15"];
  verifiedAt: string;
  source: {
    repository: string;
    taskId: string;
    contractDigest: string;
    planDigest: string;
    headSha: string;
    baseSha: string;
    pullRequest: number;
    runId: string;
    runAttempt: string;
    evidenceRunId: string;
  };
  canary: {
    pullRequest: number;
    url: string;
    planAuthor: string;
    headSha: string;
    baseSha: string;
    planDigest: string;
    artifactPath: string;
    artifactBlobSha: string;
    reviewId: number;
    reviewer: string;
    reviewedCommit: string;
    reviewState: "APPROVED";
    approvedAt: string;
    canaryFor: NonNullable<PlanContract["canaryFor"]>;
  };
}

export declare function buildBrowserPlanCanaryEvidence(input: {
  repository: string;
  contract: TaskContract;
  sourcePlan: PlanContract & { approval?: ApprovalRecord };
  sourceRun: Record<string, unknown>;
  sourcePull: Record<string, unknown>;
  sourceMergeComparison: {
    merge_base_commit?: { sha?: string };
    total_commits?: number;
    commits?: Array<{ sha?: string }>;
    status?: string;
  };
  sourceRunInfo: Record<string, unknown>;
  evidenceRunInfo: Record<string, unknown>;
  evidenceRunId: string;
  canarySelection: {
    plan: PlanContract;
    approval: ApprovalRecord;
    pr: PlanPr;
  } | null;
  canaryPlanNumber: number;
  canaryHeadSha: string;
}): BrowserPlanCanaryEvidence;
