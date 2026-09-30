import type { TaskContract } from "./task-contract.d.mts";
import type { PlanContract } from "./plan-contract.d.mts";
import type { GitHubDeps } from "./github-api.d.mts";
export interface CloudPull {
  number: number;
  state: string;
  body: string;
  user: { type: string };
  head: { ref: string; sha: string; repo: { full_name: string } };
  base: { ref: string; sha: string; repo: { full_name: string } };
}
export interface ExecutionContext {
  schema: "northstar/execution-context/1";
  host: "cloud";
  repository: string;
  pullRequest: number;
  branch: string;
  headSha: string;
  baseSha: string;
  baseBranch: string;
  taskId: string;
  contractDigest: string;
  planDigest: string;
}
export declare function validateCloudExecution(input: {
  pull: CloudPull;
  repository: string;
  contract: TaskContract;
  plan: PlanContract;
  branch: string;
  headSha: string;
  descendsFromApprovedBase: boolean;
}): boolean;
export declare function resolveCloudExecution(
  contract: TaskContract,
  plan: PlanContract,
  deps?: GitHubDeps & { vcs?: (args: string[]) => string },
): ExecutionContext;
