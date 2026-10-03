export interface WorkspaceOwnerIdentity {
  schema: "northstar/task-workspace-owner/1";
  ownerKey: string;
  repository: string;
  issue: number | null;
  taskId: string | null;
  contractDigest: string | null;
}

export interface WorkspaceOwnerClaim {
  root: string;
  identity: WorkspaceOwnerIdentity;
  lockToken: string;
}

export declare const WORKSPACE_OWNER_PATH: string;
export declare const TASK_AUTHORITY_PATHS: readonly string[];
export declare function unownedTaskAuthorityPaths(root: string): string[];

export declare function workspaceOwnerIdentity(input: {
  root: string;
  issue: number | null;
  taskId?: string | null;
  contractDigest?: string | null;
  sessionId?: string | null;
  env?: Record<string, string | undefined>;
  contract?: Record<string, unknown> | null;
}): WorkspaceOwnerIdentity;

export declare function readWorkspaceOwner(root: string): WorkspaceOwnerIdentity | null;

export declare function claimWorkspaceOwner(input: {
  root: string;
  issue: number | null;
  taskId?: string | null;
  contractDigest?: string | null;
  sessionId?: string | null;
  env?: Record<string, string | undefined>;
  contract?: Record<string, unknown> | null;
  allowUnownedState?: boolean;
  allowUnownedStatePaths?: string[];
}): WorkspaceOwnerClaim;

export declare function assertWorkspaceOwner(
  root: string,
  claimOrIdentity?: WorkspaceOwnerClaim | WorkspaceOwnerIdentity | null,
): WorkspaceOwnerIdentity | null;

export declare function bindWorkspaceOwner(
  claim: WorkspaceOwnerClaim,
  contract: { id: string; source: { bodyDigest: string } },
): WorkspaceOwnerIdentity;

export declare function releaseWorkspaceClaim(claim: WorkspaceOwnerClaim): void;
export declare function removeWorkspaceOwner(claim: WorkspaceOwnerClaim): void;
export declare function releaseTaskWorkspace(
  input: {
    root: string;
    issue: number;
    sessionId: string;
    env?: Record<string, string | undefined>;
    allowUnownedState?: boolean;
    allowUnownedStatePaths?: string[];
  },
  dependencies: { clearTaskState(root: string, claim: WorkspaceOwnerClaim): void },
): Promise<WorkspaceOwnerIdentity>;
