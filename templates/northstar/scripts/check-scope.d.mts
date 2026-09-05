import type { TaskScope } from "./task-contract.d.mts";
import type { PlanContract } from "./plan-contract.d.mts";

export declare function evaluateChangedPaths(
  paths: string[],
  scope: TaskScope,
  plan?: PlanContract | null,
): {
  ok: boolean;
  paths: string[];
  violations: string[];
  taskViolations: string[];
  planViolations: string[];
  declaredRisk: string | null;
  effectiveRisk: string;
  riskViolation: { declaredRisk: string; effectiveRisk: string } | null;
  advisoryProhibitions: string[];
};

export declare function parseNameStatus(raw: string): string[];
export declare function evaluateExecutionContext(input: {
  taskId: string;
  plan: PlanContract;
  headBranch: string;
  baseBranch: string;
  baseSha: string;
  descendsFromApprovedBase: boolean;
}): {
  ok: boolean;
  expectedHeadBranch: string;
  violations: string[];
};
