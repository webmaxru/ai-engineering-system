import type { TaskContract } from "./task-contract.d.mts";

export declare const PLAN_CACHE: string;
export declare const PLAN_CONTRACT_CACHE: string;
export declare const APPROVED_PLAN_CACHE: string;
export declare const TASK_SESSION_CACHE: string;
export declare const EXECUTION_CONTEXT_CACHE: string;
export declare const PROPOSAL_PATH: string;
export declare function clearTaskState(
  root?: string,
  ownerClaim?: import("./workspace-owner.d.mts").WorkspaceOwnerClaim | null,
): void;
export declare function taskRole(prompt: unknown): "plan" | "implement" | null;
export declare function taskInputs(prompt: unknown): {
  pullRequest: number | null;
  proposalPath: string | null;
  combined: boolean;
};

export type TaskDecision =
  | { action: "ignore" }
  | { action: "stop"; reason: string }
  | { action: "resolve"; issue: number };

export declare function isTaskInvocation(prompt: unknown): boolean;
export declare function extractIssue(prompt: unknown): number | null;
export declare function decide(prompt: unknown): TaskDecision;
export declare function resolveTask(
  issue: number,
  deps?: {
    root?: string;
    readContract?: (issue: number) => TaskContract;
    readApprovedPlan?: typeof import("./publish-plan.d.mts").fetchApprovedPlan;
    readProposedPlan?: typeof import("./publish-plan.d.mts").fetchProposedPlan;
    role?: "plan" | "implement" | null;
    sessionId?: string | null;
    env?: Record<string, string | undefined>;
    cloud?: boolean;
    pullRequest?: number | null;
    expectedHead?: string;
    proposalPath?: string | null;
    combined?: boolean;
    readWorkspace?: () => { branch: string; headSha: string };
    readCloudContext?: typeof import("./execution-context.d.mts").resolveCloudExecution;
  },
): { contract: TaskContract; plan: string | null; approvalState: "approved" | "proposed" | "missing" };
export declare function renderResult(input: {
  contract: TaskContract;
  plan: string | null;
  issue: number;
  approvalState?: "approved" | "proposed" | "missing";
}): string;
