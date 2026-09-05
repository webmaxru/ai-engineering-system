import { describe, expect, it } from "vitest";
import {
  buildExecutionReport,
  criterionCoverage,
  parseJUnit,
} from "../../scripts/build-execution-report.mjs";
import type { CheckRecord } from "../../scripts/evidence-record.mjs";
import type { PlanContract } from "../../scripts/plan-contract.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";

const contract = contractFromFile("tests/fixtures/WI-1842.issue.md");
const trustedContract = {
  ...contract,
  source: { ...contract.source, trusted: true },
};
const headSha = "a".repeat(40);
const requiredChecks = [
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
];
const plan: PlanContract = {
  schema: "northstar/plan/1",
  taskId: contract.id,
  contractDigest: contract.source.bodyDigest,
  baseBranch: "main",
  baseSha: "b".repeat(40),
  risk: "high",
  objective: contract.inputs.goal,
  scope: { allowed: ["src/**"], prohibited: [] },
  steps: ["Implement."],
  successCriteria: contract.successCriteria.map(({ id, provenBy }) => ({
    id,
    provenBy,
  })),
  requiredChecks,
  evidence: ["Evidence."],
  decisionsAndHandoffs: ["Handoff."],
  risks: ["Risk."],
  rollbackAndEscalation: ["Rollback."],
};

function check(id: string, status: CheckRecord["status"] = "pass"): CheckRecord {
  return {
    schema: "northstar/check-evidence/1",
    id,
    category: "execution result",
    status,
    required: true,
    summary: "",
    artifact: null,
    artifactDigest: null,
    producedAt: "2026-09-04T10:00:00Z",
    provenance: {
      repository: "local",
      workflow: "Governed Change",
      job: id,
      event: "local",
      runId: null,
      runAttempt: null,
      actor: "local",
      pullRequest: null,
      headSha,
      baseSha: plan.baseSha,
    },
  };
}

const testNames = contract.successCriteria.map(
  ({ provenBy }) => `suite > ${provenBy}`,
);
const junit = {
  present: true,
  path: "artifact.xml",
  tests: testNames.length,
  failures: 0,
  errors: 0,
  skipped: 0,
  passed: true,
  testNames,
};

describe("fail-closed execution evidence", () => {
  it("matches proving tests by stable leaf name, not substring", () => {
    const criterion = contract.successCriteria[0]!;
    expect(
      criterionCoverage([criterion], [`suite > ${criterion.provenBy} extra`])[0]
        ?.proven,
    ).toBe(false);
    expect(
      criterionCoverage([criterion], [`suite > ${criterion.provenBy}`])[0]
        ?.proven,
    ).toBe(true);
  });

  it("does not count skipped testcases as criterion evidence", () => {
    const parsed = parseJUnit(`
      <testsuites>
        <testsuite tests="1" failures="0" errors="0" skipped="1">
          <testcase name="suite &gt; replays the original response across instances">
            <skipped />
          </testcase>
        </testsuite>
      </testsuites>
    `);
    expect(parsed.testNames).toEqual([]);
    expect(parsed.skippedTestNames).toEqual([
      "suite > replays the original response across instances",
    ]);
    expect(
      criterionCoverage(contract.successCriteria, parsed.testNames ?? []).find(
        ({ id }) => id === "AC1",
      )?.proven,
    ).toBe(false);
  });

  it("rejects an empty acceptance suite", () => {
    const records = requiredChecks
      .filter(
        (id) =>
          ![
            "plan-approval",
            "codeql",
            "validation-authority",
            "repository-controls",
            "human-review",
            "evidence",
          ].includes(id),
      )
      .map((id) => check(id));
    const report = buildExecutionReport({
      contract,
      plan,
      records,
      unit: junit,
      acceptance: {
        ...junit,
        tests: 0,
        testNames: [],
      },
      hosted: false,
      env: { GITHUB_SHA: headSha },
    });
    expect(report).toMatchObject({ decision: "review_required" });
  });

  it("reaches ready_for_review locally while naming hosted evidence still pending", () => {
    const records = requiredChecks
      .filter(
        (id) =>
          ![
            "plan-approval",
            "codeql",
            "validation-authority",
            "repository-controls",
            "human-review",
            "evidence",
          ].includes(id),
      )
      .map((id) => check(id));
    const report = buildExecutionReport({
      contract: trustedContract,
      plan,
      records,
      unit: junit,
      acceptance: junit,
      hosted: false,
      env: { GITHUB_SHA: headSha },
    });

    expect(report).toMatchObject({
      decision: "ready_for_review",
      pendingHostedEvidence: [
        "plan-approval",
        "codeql",
        "validation-authority",
        "repository-controls",
        "human-review",
      ],
    });
  });

  it("rejects local evidence when evaluated as hosted evidence", () => {
    const records = requiredChecks
      .filter(
        (id) =>
          ![
            "plan-approval",
            "codeql",
            "repository-controls",
            "human-review",
            "evidence",
          ].includes(id),
      )
      .map((id) => check(id));
    expect(
      buildExecutionReport({
        contract: trustedContract,
        plan,
        records,
        unit: junit,
        acceptance: junit,
        hosted: true,
        env: {
          GITHUB_SHA: headSha,
          GITHUB_REPOSITORY: "webmaxru/northstar-orders-api-demo",
        },
      }),
    ).toMatchObject({ decision: "review_required" });
  });

  it("fails on a red dependency gate", () => {
    const records = requiredChecks
      .filter((id) => id !== "evidence")
      .map((id) => check(id, id === "dependency-review" ? "fail" : "pass"));
    expect(
      buildExecutionReport({
        contract,
        plan,
        records,
        unit: junit,
        acceptance: junit,
        hosted: false,
        env: { GITHUB_SHA: headSha },
      }),
    ).toMatchObject({
      decision: "review_required",
      failedLocalChecks: expect.arrayContaining(["dependency-review"]),
    });
  });

  it("rejects evidence produced for another commit", () => {
    const records = requiredChecks
      .filter((id) => id !== "evidence")
      .map((id) => ({
        ...check(id),
        provenance: { ...check(id).provenance, headSha: "d".repeat(40) },
      }));
    expect(
      buildExecutionReport({
        contract,
        plan,
        records,
        unit: junit,
        acceptance: junit,
        hosted: false,
        env: { GITHUB_SHA: headSha },
      }),
    ).toMatchObject({ decision: "review_required" });
  });

  it("rejects duplicate records and hosted records with missing run identity", () => {
    const baseRecords = requiredChecks
      .filter((id) => id !== "evidence")
      .map((id) => ({
        ...check(id),
        provenance: {
          ...check(id).provenance,
          repository: "webmaxru/northstar-orders-api-demo",
          runId: id === "quality" ? null : "42",
        },
      }));
    const report = buildExecutionReport({
      contract: trustedContract,
      plan,
      records: [...baseRecords, check("acceptance")],
      unit: junit,
      acceptance: junit,
      hosted: true,
      env: {
        GITHUB_SHA: headSha,
        GITHUB_REPOSITORY: "webmaxru/northstar-orders-api-demo",
        GITHUB_RUN_ID: "42",
      },
    });

    expect(report).toMatchObject({ decision: "review_required" });
    expect(
      (report.checks as Array<{ id: string; reasons: string[] }>).find(
        ({ id }) => id === "acceptance",
      )?.reasons,
    ).toContain("duplicate evidence");
    expect(
      (report.checks as Array<{ id: string; reasons: string[] }>).find(
        ({ id }) => id === "quality",
      )?.reasons,
    ).toContain("workflow run mismatch");
  });

  it("requires validation authority for hosted acceptance regardless of plan risk", () => {
    const mediumPlan = {
      ...plan,
      risk: "medium" as const,
      requiredChecks: [
        "plan-contract",
        "scope-policy",
        "quality",
        "acceptance",
        "dependency-review",
        "secret-scan",
        "merge-validation",
        "human-review",
        "evidence",
      ],
    };
    const records = mediumPlan.requiredChecks
      .filter((id) => id !== "evidence")
      .map((id) => ({
        ...check(id),
        provenance: {
          ...check(id).provenance,
          repository: "webmaxru/northstar-orders-api-demo",
          runId: "42",
        },
      }));
    const report = buildExecutionReport({
      contract: trustedContract,
      plan: mediumPlan,
      records,
      unit: junit,
      acceptance: junit,
      hosted: true,
      env: {
        GITHUB_SHA: headSha,
        GITHUB_REPOSITORY: "webmaxru/northstar-orders-api-demo",
        GITHUB_RUN_ID: "42",
      },
    });
    expect(report).toMatchObject({
      decision: "ready_for_review",
      pendingHostedEvidence: expect.arrayContaining(["validation-authority"]),
    });
  });

  it("reaches ready_for_acceptance only when every hosted check passes", () => {
    const records = requiredChecks
      .filter((id) => id !== "evidence")
      .map((id) => ({
        ...check(id),
        provenance: {
          ...check(id).provenance,
          repository: "webmaxru/northstar-orders-api-demo",
          runId: "42",
        },
      }));
    expect(
      buildExecutionReport({
        contract: trustedContract,
        plan,
        records,
        unit: junit,
        acceptance: junit,
        hosted: true,
        env: {
          GITHUB_SHA: headSha,
          GITHUB_REPOSITORY: "webmaxru/northstar-orders-api-demo",
          GITHUB_RUN_ID: "42",
        },
      }),
    ).toMatchObject({
      decision: "ready_for_acceptance",
      failedLocalChecks: [],
      pendingHostedEvidence: [],
    });
  });
});
