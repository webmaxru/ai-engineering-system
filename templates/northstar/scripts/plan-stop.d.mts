import type { TaskContract } from "./task-contract.d.mts";
import type { WorkspaceOwnerClaim } from "./workspace-owner.d.mts";

export declare function claimOwnedPlanSession(
  input: Record<string, unknown>,
  options?: {
    root?: string;
    env?: Record<string, string | undefined>;
  },
): {
  claim: WorkspaceOwnerClaim;
  contract: TaskContract;
  session: Record<string, unknown>;
};
