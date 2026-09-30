import type { TaskContract } from "./task-contract.d.mts";
import type { Risk } from "./risk-policy.d.mts";

export interface DeferredCriterion {
  id: string;
  stage: "post-acceptance";
  reason: string;
  evidence: string;
}

export interface BrowserPlanCanaryBinding {
  sourceTaskId: string;
  sourceContractDigest: string;
  sourcePlanDigest: string;
  sourceBaseSha: string;
  sourcePullRequest: number;
  sourceHeadSha: string;
  sourceRunId: string;
  sourceRunAttempt: string;
  sourceEvidenceRunId: string;
  bootstrapPlanPr: number;
  bootstrapPlanHeadSha: string;
  bootstrapReviewId: number;
  bootstrapReviewer: string;
}

export interface PlanContract {
  schema: "northstar/plan/1";
  taskId: string;
  contractDigest: string;
  baseBranch: string;
  baseSha: string;
  risk: Risk;
  objective: string;
  scope: { allowed: string[]; prohibited: string[] };
  operations?: string[];
  steps: string[];
  successCriteria: Array<{ id: string; provenBy: string }>;
  deferredCriteria?: DeferredCriterion[];
  canaryFor?: BrowserPlanCanaryBinding;
  requiredChecks: string[];
  evidence: string[];
  decisionsAndHandoffs: string[];
  risks: string[];
  rollbackAndEscalation: string[];
  planDigest?: string;
}

export declare const PLAN_SCHEMA: "northstar/plan/1";
export declare const PLAN_CONTRACT_START: string;
export declare const PLAN_CONTRACT_END: string;
export declare function canonicalPlan(plan: PlanContract): string;
export declare function planDigest(plan: PlanContract): string;
export declare function extractPlanContract(markdown: unknown): PlanContract | null;
export declare function renderPlanContract(plan: PlanContract): string;
export declare function validatePlanContract(
  plan: PlanContract,
  contract: TaskContract | null,
): {
  ok: boolean;
  errors: string[];
  warnings: string[];
  inferredRisk?: Risk;
  requiredChecks?: string[];
  planDigest?: string;
};
