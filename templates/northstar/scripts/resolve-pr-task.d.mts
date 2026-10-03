import type { TaskContract } from "./task-contract.d.mts";

export declare function linkedIssue(body: unknown): number | null;
export declare function runScopedUnownedCachePaths(
  contract: TaskContract,
  env?: Record<string, string | undefined>,
): string[];
