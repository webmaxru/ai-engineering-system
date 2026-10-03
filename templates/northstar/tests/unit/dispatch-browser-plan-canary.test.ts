import { describe, expect, it } from "vitest";
import { browserCanaryDispatchArgs } from "../../scripts/dispatch-browser-plan-canary.mjs";

const sourceHead = "a".repeat(40);
const canaryHead = "b".repeat(40);
const plan = {
  baseBranch: "main",
  canaryFor: {
    sourcePullRequest: 18,
    sourceHeadSha: sourceHead,
    sourceRunId: "9001",
    sourceEvidenceRunId: "9002",
  },
};

describe("browser-canary dispatch", () => {
  it("dispatches the protected verifier with original and canary identities", () => {
    expect(browserCanaryDispatchArgs(plan, {
      planPrNumber: 25,
      planHeadSha: canaryHead,
      defaultBranch: "main",
    })).toEqual([
      "workflow", "run", "system-maintenance-approval.yml",
      "--ref", "main",
      "-f", "pull-request=18",
      "-f", `head-sha=${sourceHead}`,
      "-f", "evidence-run-id=9002",
      "-f", "source-run-id=9001",
      "-f", "canary-plan-pr-number=25",
      "-f", `canary-plan-head-sha=${canaryHead}`,
    ]);
  });

  it("skips ordinary plans and rejects dispatch against a different default branch", () => {
    expect(browserCanaryDispatchArgs({ baseBranch: "main" }, {
      planPrNumber: 25,
      planHeadSha: canaryHead,
      defaultBranch: "main",
    })).toBeNull();
    expect(() => browserCanaryDispatchArgs(plan, {
      planPrNumber: 25,
      planHeadSha: canaryHead,
      defaultBranch: "release",
    })).toThrow(/exact original and current PR identities/);
  });
});
