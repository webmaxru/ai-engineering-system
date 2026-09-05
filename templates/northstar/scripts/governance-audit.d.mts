export interface GovernanceCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export declare function auditSourceTree(): {
  schema: "northstar/governance-report/1";
  generatedAt: string;
  policySchema: string;
  reviewCadence: Record<string, string>;
  ownership: Record<string, string>;
  checks: GovernanceCheck[];
  sourceControlsReady: boolean;
  externalControls: Record<string, "not-verified">;
};
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
export declare function environmentAllowsOnlyDefaultBranch(
  environment: Record<string, unknown>,
  branchPolicies: Array<Record<string, unknown>>,
  defaultBranch: string,
): boolean;
export declare function exactStringSet(
  actual: Iterable<string>,
  expected: Iterable<string>,
): boolean;
