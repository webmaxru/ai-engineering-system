import type { TaskContract } from "./task-contract.d.mts";
import type { PlanContract } from "./plan-contract.d.mts";

export interface TaskWorkspaceProvisionResult {
  path: string;
  branch: string;
  baseSha?: string;
  headSha?: string;
  created: boolean;
}

export declare function validateWorktreeDestination(
  repositoryRoot: string,
  requestedPath: string,
  options?: { allowExisting?: boolean },
): string;

export declare function parseWorktreeList(raw: string): Array<{
  path: string;
  branch: string | null;
  detached: boolean;
}>;

export declare function verifyTaskWorktree(
  input: { target: string; branch: string; baseSha: string },
  run?: (args: string[]) => string,
): { branch: string; headSha: string };

export declare function provisionTaskWorktree(
  input: { issue: number; requestedPath: string; sessionId: string; repositoryRoot?: string },
  dependencies?: {
    readContract?: (issue: number) => TaskContract;
    readApprovedPlan?: (contract: TaskContract) => {
      plan: PlanContract;
      approval: Record<string, unknown>;
    } | null;
    run?: (args: string[]) => string;
    selectExisting?: (input: Record<string, unknown>) => TaskWorkspaceProvisionResult;
    resolveTask?: (issue: number, options: Record<string, unknown>) => {
      approvalState: string;
    };
  },
): TaskWorkspaceProvisionResult;
