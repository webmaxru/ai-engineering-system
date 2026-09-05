import type { TaskContract } from "./task-contract.d.mts";

export declare const PLAN_CACHE: string;
export declare const PLAN_CONTRACT_CACHE: string;

export type TaskDecision =
  | { action: "ignore" }
  | { action: "stop"; reason: string }
  | { action: "resolve"; issue: number };

export declare function isTaskInvocation(prompt: unknown): boolean;
export declare function extractIssue(prompt: unknown): number | null;
export declare function decide(prompt: unknown): TaskDecision;
export declare function resolveTask(
  issue: number,
): { contract: TaskContract; plan: string | null };
export declare function renderResult(input: {
  contract: TaskContract;
  plan: string | null;
  issue: number;
}): string;
