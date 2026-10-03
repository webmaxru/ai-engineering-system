import type { TaskContract } from "./task-contract.d.mts";

export declare const PLAN_HEADING: string;

export interface PlanPr {
  number: number;
  body: string;
  url: string;
  author: { login: string };
  headRefOid: string;
  baseRefOid: string;
  isDraft: boolean;
  headRefName?: string;
  baseRefName?: string;
  headRepoFullName?: string | null;
  baseRepoFullName?: string | null;
  state?: string;
}

export interface GitOptions {
  env?: Record<string, string>;
  input?: string;
}
export interface LegacyPlan {
  repository: string;
  pr: number;
  headSha: string;
  baseSha: string;
  contractDigest: string;
  planDigest: string;
}
export interface PublishDeps {
  run?: (args: string[]) => string;
  vcs?: (args: string[], options?: GitOptions) => string;
  at?: string;
  base?: string;
  reviewers?: string[];
  legacyPlans?: LegacyPlan[];
  pullRequest?: number | null;
  headBranch?: string;
  expectedHead?: string;
  canary?: boolean;
  planPrNumber?: number;
}

export declare function planBranch(taskId: string, canary?: boolean): string;
export declare function implementationBranch(taskId: string): string;
export declare function resolveBase(
  vcs: (args: string[]) => string,
  override?: string,
): string;
export declare function renderPlan(body: string, meta?: { at?: string; issue?: number }): string;
export declare function extractPlanSection(prBody: unknown): string | null;
export declare function extractPlan(raw: unknown): string | null;
export declare function findPlanPr(taskId: string, deps?: PublishDeps): PlanPr | null;
export declare function configuredPlanReviewers(author: string, deps?: PublishDeps): string[];
export declare function publish(
  contract: TaskContract,
  body: string,
  deps?: PublishDeps,
): { updated: boolean; number: number; url: string };
export declare function fetchPlan(taskId: string, deps?: PublishDeps): string | null;
export declare function fetchProposedPlan(contract: TaskContract, deps?: PublishDeps): {
  body: string;
  plan: import("./plan-contract.d.mts").PlanContract;
  pr: PlanPr;
  approval: null;
} | null;
export declare function fetchApprovedPlan(
  contract: TaskContract,
  deps?: PublishDeps,
): {
  body: string;
  plan: import("./plan-contract.d.mts").PlanContract;
  approval: import("./plan-approval.d.mts").ApprovalRecord;
  pr: PlanPr;
} | null;