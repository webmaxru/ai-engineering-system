import type { BrowserPlanCanaryBinding, PlanContract } from "./plan-contract.d.mts";

type CanaryDispatchPlan = Pick<PlanContract, "baseBranch"> & {
  canaryFor?: Pick<
    BrowserPlanCanaryBinding,
    "sourcePullRequest" | "sourceHeadSha" | "sourceRunId" | "sourceEvidenceRunId"
  >;
};

export declare function browserCanaryDispatchArgs(
  plan: CanaryDispatchPlan | null | undefined,
  input: {
    planPrNumber?: number;
    planHeadSha?: string;
    defaultBranch?: string;
  },
): string[] | null;
