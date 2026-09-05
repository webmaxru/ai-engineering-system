import { describe, expect, it } from "vitest";
import {
  evaluateExecutionContext,
  evaluateChangedPaths,
  parseNameStatus,
} from "../../scripts/check-scope.mjs";

const scope = {
  allowed: ["src/**", "tests/**"],
  prohibited: ["src/api/**", "public API response fields"],
};

describe("changed-path scope gate", () => {
  it("accepts files inside the allowed scope", () => {
    expect(
      evaluateChangedPaths(
        ["src/services/order-service.ts", "tests/unit/order-service.test.ts"],
        scope,
      ),
    ).toMatchObject({ ok: true, violations: [] });
  });

  it("rejects out-of-scope and path-prohibited files", () => {
    const result = evaluateChangedPaths(
      ["README.md", "src/api/schema.ts"],
      scope,
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(["README.md", "src/api/schema.ts"]);
  });

  it("surfaces prose prohibitions as semantic review requirements", () => {
    expect(
      evaluateChangedPaths(["src/services/order-service.ts"], scope)
        .advisoryProhibitions,
    ).toEqual(["public API response fields"]);
  });

  it("checks both sides of a rename", () => {
    expect(
      parseNameStatus(
        "R100\tsrc/services/old.ts\t.github/workflows/new.yml\n",
      ),
    ).toEqual(["src/services/old.ts", ".github/workflows/new.yml"]);
  });

  it("enforces plan scope and effective risk inside a broader task contract", () => {
    const result = evaluateChangedPaths(
      [".github/workflows/changed.yml"],
      { allowed: ["src/**", ".github/**"], prohibited: [] },
      {
        schema: "northstar/plan/1",
        taskId: "TASK-1",
        contractDigest: "a".repeat(64),
        baseBranch: "main",
        baseSha: "b".repeat(40),
        risk: "medium",
        objective: "Bounded application change",
        scope: { allowed: ["src/**"], prohibited: [] },
        steps: ["Change src."],
        successCriteria: [{ id: "AC1", provenBy: "works" }],
        requiredChecks: ["quality"],
        evidence: ["tests"],
        decisionsAndHandoffs: ["planner to implementer"],
        risks: ["bounded"],
        rollbackAndEscalation: ["revert"],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.planViolations).toEqual([
      ".github/workflows/changed.yml",
    ]);
    expect(result.riskViolation).toEqual({
      declaredRisk: "medium",
      effectiveRisk: "high",
    });
  });

  it("binds implementation to the approved branch, base branch, and base SHA", () => {
    const plan = {
      schema: "northstar/plan/1" as const,
      taskId: "TASK-1",
      contractDigest: "a".repeat(64),
      baseBranch: "main",
      baseSha: "b".repeat(40),
      risk: "high" as const,
      objective: "Implement",
      scope: { allowed: ["src/**"], prohibited: [] },
      steps: ["Implement"],
      successCriteria: [{ id: "AC1", provenBy: "works" }],
      requiredChecks: ["quality"],
      evidence: ["tests"],
      decisionsAndHandoffs: ["handoff"],
      risks: ["risk"],
      rollbackAndEscalation: ["revert"],
    };
    expect(
      evaluateExecutionContext({
        taskId: "TASK-1",
        plan,
        headBranch: "agent/implement/task-1",
        baseBranch: "main",
        baseSha: "b".repeat(40),
        descendsFromApprovedBase: true,
      }),
    ).toMatchObject({ ok: true });
    expect(
      evaluateExecutionContext({
        taskId: "TASK-1",
        plan,
        headBranch: "feature/other",
        baseBranch: "release",
        baseSha: "c".repeat(40),
        descendsFromApprovedBase: false,
      }),
    ).toMatchObject({
      ok: false,
      violations: expect.arrayContaining([
        expect.stringMatching(/head branch/),
        expect.stringMatching(/base branch/),
        expect.stringMatching(/base SHA/),
        expect.stringMatching(/does not descend/),
      ]),
    });
  });
});
