import type { GitHubDeps } from "./github-api.d.mts";
export interface PlanFileChange {
  filename: string;
  status: string;
  sha?: string;
  previous_filename?: string;
}
export interface PlanTreeEntry {
  path: string;
  type: string;
  mode: string;
  sha: string;
}
export declare const PLAN_DIRECTORY: string;
export declare function planArtifactPath(taskId: string): string;
export declare function localProposalPath(file: string, root: string): string;
export declare function validatePlanOnlyFiles(input: {
  taskId: string;
  files: PlanFileChange[];
  entry: PlanTreeEntry;
}): { ok: true; path: string; blobSha: string } | { ok: false; reason: string };
export declare function readPlanArtifact(
  headSha: string,
  taskId: string,
  deps?: GitHubDeps,
): { path: string; entry: PlanTreeEntry; body: string };
