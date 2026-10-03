export declare function importEvidenceArtifacts(
  source: string,
  destination?: string,
  options?: { maintenance?: boolean },
): string[];

export declare function importWorkflowResults(
  runId: string,
  destination?: string,
  options?: {
    env?: Record<string, string | undefined>;
    run?: (args: string[]) => string;
  },
): import("./evidence-record.d.mts").CheckRecord[];
