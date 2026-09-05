export type Risk = "low" | "medium" | "high" | "critical";

export interface RiskAssessment {
  risk: Risk;
  pathMatches: Array<{ path: string; risk: Risk; reason: string }>;
  operationMatches: Array<{ operation: string; risk: Risk }>;
}

export declare const RISK_LEVELS: readonly Risk[];
export declare const GOVERNANCE_POLICY: Record<string, unknown>;
export declare function riskRank(risk: unknown): number;
export declare function isRisk(value: unknown): value is Risk;
export declare function maxRisk(...values: Array<Risk | Risk[]>): Risk;
export declare function inferRisk(input?: {
  paths?: string[];
  operations?: string[];
}): RiskAssessment;
export declare function requiredChecksForRisk(risk: Risk): string[];
export declare function approvalPolicyForRisk(risk: Risk): {
  minimumApprovals: number;
  requireLatestHead: boolean;
  requirePlanOnlyApproval: boolean;
  requireCodeOwnerReview: boolean;
};
