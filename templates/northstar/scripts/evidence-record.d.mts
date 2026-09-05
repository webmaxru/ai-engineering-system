export type CheckStatus = "pass" | "fail" | "skipped" | "not-run";

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
  provenance: {
    repository: string;
    workflow: string;
    job: string;
    event: string;
    runId: string | null;
    runAttempt: string | null;
    actor: string;
    pullRequest: number | null;
    headSha: string | null;
    baseSha: string | null;
  };
}

export declare const CHECK_SCHEMA: "northstar/check-evidence/1";
export declare const CHECK_STATUSES: readonly CheckStatus[];
export declare function digestPath(relativePath?: string | null): string | null;
export declare function createCheckRecord(
  input: {
    id: string;
    category?: string;
    status: CheckStatus;
    required?: boolean;
    summary?: string;
    artifact?: string;
    producedAt?: string;
  },
  env?: Record<string, string | undefined>,
): CheckRecord;
export declare function writeCheckRecord(record: CheckRecord, out?: string): string;
