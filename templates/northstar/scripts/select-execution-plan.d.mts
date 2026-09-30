import type { CheckStatus } from "./evidence-record.d.mts";
import type { ApprovalRecord } from "./plan-approval.d.mts";
import type { PlanContract } from "./plan-contract.d.mts";
import type { TaskContract } from "./task-contract.d.mts";
import type { fetchApprovedPlan, fetchProposedPlan } from "./publish-plan.d.mts";
import type { Risk } from "./risk-policy.d.mts";

export interface ExecutionPlanRequirements {
  repository: string;
  risk: Risk;
  approvalRequired: boolean;
  requiredChecks: string[];
  planDigest: string;
  planPath: "artifacts/approved-plan.json" | "artifacts/candidate-plan.json";
}
export interface ExecutionPlanSelection extends ExecutionPlanRequirements {
  approvalState: "approved" | "proposed" | "missing";
  plan: PlanContract & { approval?: ApprovalRecord };
  body: string;
}
export interface ExecutionPlanInput {
  contract: TaskContract;
  candidate: (PlanContract & { approval?: unknown }) | null;
  pullRequest?: number;
  expectedHead?: string;
}
export interface ExecutionPlanOptions {
  run?: (args: string[]) => string;
  readApprovedPlan?: typeof fetchApprovedPlan;
  readProposedPlan?: typeof fetchProposedPlan;
  requirementsOnly?: boolean;
  approvalOnly?: boolean;
  allowMerged?: boolean;
}
export declare function executionPlanRequirements(contract: TaskContract, plan: PlanContract): ExecutionPlanRequirements;
export declare function selectExecutionPlan(input: ExecutionPlanInput, options?: ExecutionPlanOptions): ExecutionPlanSelection;
export declare function approvalEvidenceInput(selection: ExecutionPlanSelection): {
  id: string;
  category: string;
  required: boolean;
  status: CheckStatus;
  artifact: string;
  summary: string;
};
export declare function cacheExecutionPlan(input: ExecutionPlanInput, options?: ExecutionPlanOptions & {
  root?: string;
  env?: Record<string, string | undefined>;
  recordApproval?: boolean;
}): ExecutionPlanSelection;
export declare function executionPlanMain(options?: { approvalOnly?: boolean }): void;
