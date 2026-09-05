import type { TaskContract } from "./task-contract.d.mts";

export declare const PLAN_HEADING: string;

export interface PlanPr {
  number: number;
  body: string;
  url: string;
  author: { login: string };
  headRefOid: string;
  baseRefOid: string;
  comments: Array<{ body: string; author?: { login?: string } }>;
}

export interface PublishDeps {
  run?: (args: string[]) => string;
  vcs?: (args: string[]) => string;
  at?: string;
  base?: string;
}

export declare function planBranch(taskId: string): string;
export declare function implementationBranch(taskId: string): string;
export declare function resolveBase(
  vcs: (args: string[]) => string,
  override?: string,
): string;
export declare function renderPlan(body: string, meta?: { at?: string; issue?: number }): string;
export declare function extractPlanSection(prBody: unknown): string | null;
export declare function extractPlan(raw: unknown): string | null;
export declare function findPlanPr(taskId: string, deps?: PublishDeps): PlanPr | null;
export declare function publish(
  contract: Pick<TaskContract, "id"> & { source?: { issue?: number } },
  body: string,
  deps?: PublishDeps,
): { updated: boolean; number: number; url: string };
export declare function fetchPlan(taskId: string, deps?: PublishDeps): string | null;
export declare function fetchApprovedPlan(
  contract: TaskContract,
  deps?: PublishDeps,
): {
  body: string;
  plan: import("./plan-contract.d.mts").PlanContract;
  approval: import("./plan-approval.d.mts").ApprovalRecord;
  pr: PlanPr;
} | null;