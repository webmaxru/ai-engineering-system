export interface GovernanceCheck {
  id: string;
  ok: boolean;
  detail: string;
  status?: "pass" | "fail" | "unavailable";
}

export declare function optionalCapabilities(policy?: Record<string, unknown>): {
  mcp: boolean;
  continuousAI: boolean;
};
export declare function auditSourceTree(options?: {
  root?: string;
  policy?: Record<string, unknown>;
  trackedFiles?: string[];
  read?: (file: string) => string;
}): {
  schema: "northstar/governance-report/1";
  generatedAt: string;
  policySchema: string;
  reviewCadence: Record<string, string>;
  ownership: Record<string, string>;
  checks: GovernanceCheck[];
  sourceControlsReady: boolean;
  optionalCapabilities: { mcp: boolean; continuousAI: boolean };
  externalControls: Record<string, "not-verified">;
};
export declare function onlineControls(options?: {
  env?: Record<string, string | undefined>;
  run?: (args: string[]) => string;
  policy?: Record<string, unknown>;
}): {
  available: boolean;
  authentication: string | null;
  rulesetCount: number;
  checks: GovernanceCheck[];
  lookups: Array<{ id: string; state: "available" | "absent" | "unavailable"; detail: string }>;
  ready: boolean;
  note: string;
};
export declare function summarizeOnlineFailures(
  online: {
    checks: Array<{ id: string; ok: boolean; status?: string }>;
    lookups: Array<{ id: string; state: string; detail?: string }>;
  } | null | undefined,
): string[];
export declare function rulesetAppliesToDefaultBranch(
  ruleset: Record<string, unknown>,
  defaultBranch: string,
): boolean;
export declare function hasRulesetBypass(
  ruleset: Record<string, unknown>,
): boolean;
export declare function environmentReviewersMatch(
  rule: Record<string, unknown> | undefined,
  expected: Array<{ type: string; name: string }>,
): boolean;
export declare function strictStatusChecksEnabled(
  protection: Record<string, unknown>,
  rulesets: Array<Record<string, unknown>>,
): boolean;
export declare function strictRequiredContexts(
  protection: Record<string, unknown>,
  rulesets: Array<Record<string, unknown>>,
): Set<string>;
export declare function governedAcceptanceDatabaseUrlIsSafe(
  workflow: string,
): boolean;
export declare function governedArtifactsTargetExpectedDirectory(
  workflow: string,
): boolean;
export declare function governedSingleCheckArtifactsPreserveDirectory(
  workflow: string,
): boolean;
export declare function governedEvidenceTaskLookupPermissionsAreSafe(
  workflow: string,
): boolean;
export declare function governedRepositoryControlsHaveAppIdentity(
  workflow: string,
): boolean;
export declare function governedScopeUsesPullRequestContext(
  workflow: string,
): boolean;
export declare function governedRepositoryControlsHaveAppIdentity(
  workflow: string,
): boolean;
export declare function summarizeOnlineFailures(
  online: {
    checks: Array<{ id: string; ok: boolean; status?: string }>;
    lookups: Array<{ id: string; state: string; detail?: string }>;
  } | null | undefined,
): string[];
export declare function governedMergedArtifactsHaveUniquePaths(
  workflow: string,
): boolean;
export declare function publisherUsesTrustedDefaultBranch(
  workflow: string,
  defaultBranch?: string,
): boolean;
export declare function trustedControlsUseReadOnlyToken(
  workflow: string,
): boolean;
export declare function environmentAllowsOnlyDefaultBranch(
  environment: Record<string, unknown>,
  branchPolicies: Array<Record<string, unknown>>,
  defaultBranch: string,
): boolean;
export declare function exactStringSet(
  actual: Iterable<string>,
  expected: Iterable<string>,
): boolean;
