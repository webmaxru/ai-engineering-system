import { describe, expect, it } from "vitest";
import {
  approvalPolicyForRisk,
  inferRisk,
  maxRisk,
  requiredChecksForRisk,
} from "../../scripts/risk-policy.mjs";

describe("risk-based autonomy", () => {
  it("uses the guide's low, medium, high, and critical ordering", () => {
    expect(maxRisk("low", "high", "medium")).toBe("high");
    expect(maxRisk("critical", "low")).toBe("critical");
  });

  it("treats workflow and hook changes as high risk", () => {
    expect(
      inferRisk({ paths: [".github/workflows/ci.yml"] }).risk,
    ).toBe("high");
    expect(
      inferRisk({ paths: [".github/hooks/agent-boundary.json"] }).risk,
    ).toBe("high");
  });

  it("treats validation-supply-chain dependency changes as high risk", () => {
    expect(inferRisk({ paths: ["package-lock.json"] }).risk).toBe("high");
  });

  it("routes production operations as critical", () => {
    expect(
      inferRisk({ operations: ["production-secret-access"] }).risk,
    ).toBe("critical");
  });

  it("adds stronger checks and approval as risk increases", () => {
    expect(requiredChecksForRisk("high")).toContain("codeql");
    expect(requiredChecksForRisk("critical")).toContain(
      "production-environment",
    );
    expect(approvalPolicyForRisk("low").minimumApprovals).toBe(0);
    expect(approvalPolicyForRisk("high")).toMatchObject({
      minimumApprovals: 1,
      requirePlanOnlyApproval: true,
      requireCodeOwnerReview: true,
    });
  });
});
