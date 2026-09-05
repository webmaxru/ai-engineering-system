export declare function validateMaintenanceRuns(input: {
  manifest: Record<string, unknown>;
  evidenceRun: Record<string, unknown>;
  sourceRun: Record<string, unknown>;
  repository: string;
  pullRequest: number | string;
  headSha: string;
}): { ok: boolean; errors: string[] };
