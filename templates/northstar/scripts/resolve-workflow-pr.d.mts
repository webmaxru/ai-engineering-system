export declare function selectWorkflowPullRequest(input: {
  pulls: Array<Record<string, unknown>>;
  sha: string;
  repository: string;
  defaultBranch: string;
  expectedNumber?: number | string;
}): Record<string, unknown>;
