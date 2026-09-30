import { describe, expect, it } from "vitest";
import {
  extractPlanContract,
  planDigest,
  renderPlanContract,
  validatePlanContract,
  type PlanContract,
} from "../../scripts/plan-contract.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";

const contract = contractFromFile("tests/fixtures/WI-1842.issue.md");

function plan(overrides: Partial<PlanContract> = {}): PlanContract {
  return {
    schema: "northstar/plan/1",
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    baseBranch: "main",
    baseSha: "a".repeat(40),
    risk: "high",
    objective: contract.inputs.goal,
    scope: {
      allowed: ["src/services/postgres-idempotent-order-service.ts"],
      prohibited: contract.inputs.scope.prohibited,
    },
    operations: [],
    steps: ["Implement the accepted PostgreSQL design."],
    successCriteria: contract.successCriteria.map(({ id, provenBy }) => ({
      id,
      provenBy,
    })),
    requiredChecks: [
      "plan-contract",
      "plan-approval",
      "scope-policy",
      "quality",
      "acceptance",
      "dependency-review",
      "codeql",
      "secret-scan",
      "merge-validation",
      "governance-policy",
      "validation-authority",
      "repository-controls",
      "human-review",
      "evidence",
    ],
    evidence: ["JUnit, SARIF, dependency audit, and execution report."],
    decisionsAndHandoffs: ["Planner hands the approved plan to the implementer."],
    risks: ["Cross-instance races require PostgreSQL acceptance evidence."],
    rollbackAndEscalation: ["Revert the branch or escalate after repeated failure."],
    ...overrides,
  };
}

describe("machine-readable plan contract", () => {
  it("round-trips through the PR marker without changing its digest", () => {
    const value = plan();
    const extracted = extractPlanContract(renderPlanContract(value));

    expect(extracted).toEqual(value);
    expect(planDigest(extracted!)).toBe(planDigest(value));
    expect(
      planDigest({
        ...value,
        approval: { schema: "northstar/plan-approval/1" },
      } as PlanContract),
    ).toBe(planDigest(value));
  });

  it("binds the plan to the authoritative contract and base SHA", () => {
    expect(validatePlanContract(plan(), contract)).toMatchObject({
      ok: true,
      inferredRisk: "medium",
    });
  });

  it("rejects a stale contract digest", () => {
    const result = validatePlanContract(
      plan({ contractDigest: "0".repeat(64) }),
      contract,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/contractDigest/);
  });

  it("accepts explicit post-acceptance deferrals bound to task criteria", () => {
    const result = validatePlanContract(
      plan({
        deferredCriteria: [{
          id: "AC1",
          stage: "post-acceptance",
          reason: "Run the browser canary after the repair is accepted.",
          evidence: "Bind the native review event to the task, plan, base, and implementation head.",
        }],
      }),
      contract,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects deferred criteria outside the task and missing deferral evidence", () => {
    const unknown = validatePlanContract(
      plan({
        deferredCriteria: [{
          id: "AC99",
          stage: "post-acceptance",
          reason: "Defer a criterion.",
          evidence: "Provide the matching artifact.",
        }],
      }),
      contract,
    );
    expect(unknown.ok).toBe(false);
    expect(unknown.errors.join(" ")).toMatch(/deferred criterion AC99/i);

    const incomplete = validatePlanContract(
      plan({
        deferredCriteria: [{
          id: "AC1",
          stage: "post-acceptance",
          reason: "",
          evidence: "Provide the matching artifact.",
        }],
      }),
      contract,
    );
    expect(incomplete.ok).toBe(false);
    expect(incomplete.errors.join(" ")).toMatch(/deferred criterion AC1.*reason/i);
  });

  it("requires a canary plan to bind its source and require trusted canary evidence", () => {
    const canaryFor = {
      sourceTaskId: contract.id,
      sourceContractDigest: contract.source.bodyDigest,
      sourcePlanDigest: "c".repeat(64),
      sourceBaseSha: "b".repeat(40),
      sourcePullRequest: 17,
      sourceHeadSha: "d".repeat(40),
      sourceRunId: "18",
      sourceRunAttempt: "2",
      sourceEvidenceRunId: "19",
      bootstrapPlanPr: 20,
      bootstrapPlanHeadSha: "e".repeat(40),
      bootstrapReviewId: 21,
      bootstrapReviewer: "vibeprogrammer",
    };
    const valid = validatePlanContract(
      plan({
        canaryFor,
        requiredChecks: [...plan().requiredChecks, "browser-plan-canary"],
      }),
      contract,
    );
    expect(valid.ok).toBe(true);

    const missingCanaryCheck = validatePlanContract(
      plan({ canaryFor }),
      contract,
    );
    expect(missingCanaryCheck.ok).toBe(false);
    expect(missingCanaryCheck.errors.join(" ")).toMatch(/require browser-plan-canary/i);
  });

  it("rejects risk below the deterministic floor", () => {
    const result = validatePlanContract(
      plan({
        risk: "medium",
        scope: {
          allowed: [".github/workflows/ci.yml"],
          prohibited: [],
        },
      }),
      contract,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/lower than the deterministic floor/);
  });

  it("rejects missing risk-required checks", () => {
    const result = validatePlanContract(
      plan({ requiredChecks: ["quality"] }),
      contract,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/requires check/);
  });

  it("rejects changes to the criterion-to-test contract", () => {
    const criteria = plan().successCriteria.map((criterion) =>
      criterion.id === "AC3"
        ? { ...criterion, provenBy: "a weaker sequential test" }
        : criterion,
    );
    const result = validatePlanContract(
      plan({ successCriteria: criteria }),
      contract,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/changes the proving test/);
  });

  it("rejects a plan scope broader than the task contract", () => {
    const narrowContract = {
      ...contract,
      inputs: {
        ...contract.inputs,
        scope: {
          allowed: ["src/services/**"],
          prohibited: [],
        },
      },
    };
    const result = validatePlanContract(
      plan({
        scope: { allowed: ["src/**"], prohibited: [] },
      }),
      narrowContract,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/outside the task contract/);
  });
});
