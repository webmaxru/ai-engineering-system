export type FailureLayer =
  | "policy"
  | "security"
  | "environment"
  | "tool"
  | "context"
  | "reasoning"
  | "conflict"
  | "unknown";

export interface Attempt {
  check: string;
  message: string;
}

export interface Classification {
  layer: FailureLayer;
  action: "repair" | "escalate";
  change: string;
}

export interface HistoryEntry extends Attempt, Classification {
  signature: string;
  attempt: number;
}

export interface RepairDecision {
  decision: "proceed" | "repair" | "escalate";
  reason: string;
  signature?: string;
  repeats?: number;
  remainingAttempts?: number;
  history: HistoryEntry[];
}

export declare const MAX_ATTEMPTS: number;

export declare function failureSignature(attempt: Attempt): string;

export declare function classify(message: string): Classification;

export declare function decide(attempts: Attempt[]): RepairDecision;

export interface FailureEvidence extends Classification {
  check: string;
  signature: string;
}

export interface StopAttempt {
  id: string;
  number: number;
  headSha: string;
  sessionId?: string | null;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "failed" | "passed";
  failures: FailureEvidence[];
  checks: string[];
  reportPath: string | null;
  reportDigest: string | null;
}

export interface StopOutcome {
  failures: FailureEvidence[];
  gaps?: string[];
  checks?: string[];
  reportPath?: string | null;
  reportDigest?: string | null;
  summary?: string;
}

export interface StopRecoveryDecision {
  decision: "proceed" | "repair" | "escalate";
  reason: string;
  signature?: string;
  repeats?: number;
  remainingAttempts?: number;
  history: Array<FailureEvidence & { attempt: number }>;
}

export declare function failureEvidence(attempt: Attempt): FailureEvidence;
export declare function decideStopAttempts(attempts: StopAttempt[]): StopRecoveryDecision;
export declare function runStopAttempt(
  scope: {
    repository: string;
    taskId: string | null;
    contractDigest: string | null;
    planDigest: string | null;
    baseSha: string | null;
    headSha: string;
    sessionId: string;
  },
  evaluate: (attempt: StopAttempt) => StopOutcome,
  options?: { root?: string },
): StopRecoveryDecision & { path: string; attempts: StopAttempt[]; outcome: StopOutcome | null };
