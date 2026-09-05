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
