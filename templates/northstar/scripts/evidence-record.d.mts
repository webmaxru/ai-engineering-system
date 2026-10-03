export type CheckStatus = "pass" | "fail" | "skipped" | "not-run";

export interface SourceState {
  headSha: string;
  dirty: boolean;
}

export interface EvidenceContext {
  repository: string;
  taskId: string | null;
  contractDigest: string | null;
  planDigest: string | null;
  headSha: string;
  baseSha: string | null;
  runId: string;
  runAttempt: string | null;
  pullRequest: number | null;
  source: SourceState;
  executionRunId: string;
  executionRunAttempt: string | null;
  workflow: string;
  event: string;
  actor: string;
  validationStartedAt: string | null;
}

export interface EvidenceOptions {
  root?: string;
  contract?: import("./task-contract.d.mts").TaskContract | null;
  plan?: import("./plan-contract.d.mts").PlanContract | null;
}

export interface CheckRecord {
  schema: "northstar/check-evidence/1";
  id: string;
  category: string;
  status: CheckStatus;
  required: boolean;
  summary: string;
  artifact: string | null;
  artifactDigest: string | null;
  producedAt: string;
  provenance: EvidenceContext & {
    job: string;
  };
  importedBy?: EvidenceContext;
  workflowJob?: {
    id: number;
    url: string;
    conclusion: string | null;
    startedAt: string;
    completedAt: string;
  };
}

export declare const CHECK_SCHEMA: "northstar/check-evidence/1";
export declare const CHECK_STATUSES: readonly CheckStatus[];
export declare const SOURCE_RUN_PATH: string;
export declare const CHECK_ARTIFACTS: Readonly<Record<string, readonly string[]>>;
export declare function evidencePath(path: string, root?: string): string;
export declare function readEvidenceJson(path: string, root?: string): Record<string, unknown> | null;
export declare function digestPath(relativePath?: string | null, root?: string): string | null;
export declare function readSourceState(root?: string): SourceState;
export declare function hasLiveTaskIdentity(contract: unknown, repository: string): boolean;
export declare function evidenceContext(
  env?: Record<string, string | undefined>,
  options?: EvidenceOptions,
): EvidenceContext;
export declare function artifactErrors(record: CheckRecord, root?: string): string[];
export declare function validateCheckRecord(
  record: unknown,
  expected: EvidenceContext,
  options?: { root?: string; hosted?: boolean },
): { valid: boolean; reasons: string[] };
export declare function createCheckRecord(
  input: {
    id: string;
    category?: string;
    status: CheckStatus;
    required?: boolean;
    summary?: string;
    artifact?: string | null;
    producedAt?: string;
  },
  env?: Record<string, string | undefined>,
  options?: EvidenceOptions,
): CheckRecord;
export declare function writeCheckRecord(record: CheckRecord, out?: string, root?: string): string;
