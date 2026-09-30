import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildExecutionReport,
  checkFailureDiagnostics,
  criterionCoverage,
  loadCheckRecords,
  parseJUnit,
  readJUnit,
} from "../../scripts/build-execution-report.mjs";
import {
  CHECK_ARTIFACTS,
  createCheckRecord,
  digestPath,
  evidenceContext,
  readSourceState,
} from "../../scripts/evidence-record.mjs";
import type { CheckRecord } from "../../scripts/evidence-record.mjs";
import { planDigest } from "../../scripts/plan-contract.mjs";
import type { PlanContract } from "../../scripts/plan-contract.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import type { TaskContract } from "../../scripts/task-contract.mjs";

const root = mkdtempSync(join(tmpdir(), "northstar-report-"));
const contract = contractFromFile("tests/fixtures/WI-1842.issue.md");
const trustedContract = {
  ...contract,
  source: {
    ...contract.source, trusted: true, kind: "issue #7", issue: 7,
    actor: "fixture-owner", association: "OWNER",
    url: "https://github.com/webmaxru/northstar-orders-api-demo/issues/7",
  },
};
const requiredChecks = [
  "plan-contract", "plan-approval", "scope-policy", "quality", "acceptance",
  "dependency-review", "codeql", "secret-scan", "merge-validation",
  "governance-policy", "validation-authority", "repository-controls", "human-review", "evidence",
];
const revalidated = new Set([
  "plan-contract", "plan-approval", "scope-policy", "validation-authority",
  "repository-controls", "human-review", "browser-plan-canary",
]);
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
  successCriteria: contract.successCriteria.map(({ id, provenBy }) => ({ id, provenBy })),
  requiredChecks,
  evidence: ["Evidence."],
  decisionsAndHandoffs: ["Handoff."],
  risks: ["Risk."],
  rollbackAndEscalation: ["Rollback."],
};
plan.planDigest = planDigest(plan);
let headSha: string;
let localEnv: Record<string, string | undefined>;
let hostedEnv: Record<string, string | undefined>;

function write(path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function junit(names = contract.successCriteria.map(({ provenBy }) => provenBy)) {
  return `<testsuites><testsuite tests="${names.length}" failures="0" errors="0" skipped="0">${
    names.map((name) => `<testcase name="suite &gt; ${name}" />`).join("")
  }</testsuite></testsuites>`;
}

beforeAll(() => {
  const git = (args: string[]) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git(["init", "--quiet"]);
  write(".gitignore", "artifacts/\n");
  write("source.txt", "committed source\n");
  git(["add", ".gitignore", "source.txt"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "core.hooksPath=.git/hooks", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Offline test fixture"]);
  headSha = git(["rev-parse", "HEAD"]);
  localEnv = {
    NORTHSTAR_HEAD_SHA: headSha, BASE_SHA: plan.baseSha,
    NORTHSTAR_RUN_ID: "local-validation", NORTHSTAR_RUN_ATTEMPT: "2",
  };
  hostedEnv = {
    ...localEnv,
    GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "webmaxru/northstar-orders-api-demo",
    NORTHSTAR_RUN_ID: "42", GITHUB_RUN_ID: "900", GITHUB_RUN_ATTEMPT: "9",
    GITHUB_WORKFLOW: "Publish Evidence", GITHUB_EVENT_NAME: "workflow_run",
    GITHUB_ACTOR: "fixture-publisher", PR_NUMBER: "7",
  };
});

beforeEach(() => {
  rmSync(join(root, "artifacts"), { recursive: true, force: true });
  rmSync(join(root, "incoming-evidence"), { recursive: true, force: true });
  write("source.txt", "committed source\n");
  rmSync(join(root, "untracked.txt"), { force: true });
  for (const [id, paths] of Object.entries(CHECK_ARTIFACTS)) {
    for (const path of paths) {
      if (id === "browser-plan-canary") continue;
      if (id === "codeql") {
        write(`${path}/results.sarif`, JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: { name: "CodeQL" } }, results: [] }] }));
      } else if (path.endsWith(".xml")) {
        write(path, junit());
      } else {
        const governance = {
          schema: "northstar/governance-report/1", sourceControlsReady: true,
          checks: [{ id: "fixture", ok: true }], online: { available: true, ready: true },
        };
        const values: Record<string, unknown> = {
          "scope-policy": { schema: "northstar/scope-report/1", taskId: contract.id, contractDigest: contract.source.bodyDigest, paths: [], violations: [], ok: true },
          "merge-validation": { schema: "northstar/merge-report/1", base: plan.baseSha, ok: true },
          "governance-policy": governance, "repository-controls": governance,
          "dependency-review": { metadata: { vulnerabilities: { high: 0, critical: 0 } } },
          "validation-authority": { schema: "northstar/validation-authority-report/1", headSha, pullRequest: 7, ok: true, changedAuthority: [] },
        };
        write(path, JSON.stringify(id.startsWith("plan-") ? plan : values[id]));
      }
    }
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function check(
  id: string,
  status: CheckRecord["status"] = "pass",
  hosted = false,
  candidatePlan = plan,
  candidateContract: TaskContract = trustedContract,
): CheckRecord {
  const producer = hosted && !revalidated.has(id) ? {
    ...hostedEnv, GITHUB_RUN_ID: "42", GITHUB_RUN_ATTEMPT: "2", GITHUB_WORKFLOW: "Governed Change",
    GITHUB_EVENT_NAME: "pull_request", GITHUB_ACTOR: "fixture-producer",
  } : hosted ? hostedEnv : localEnv;
  return createCheckRecord({
    id, status, artifact: CHECK_ARTIFACTS[id]?.[0] ?? null,
  }, { ...producer, NORTHSTAR_JOB_ID: id }, {
    root, contract: candidateContract, plan: candidatePlan,
  });
}

function records(
  hosted = false,
  candidatePlan = plan,
  candidateContract: TaskContract = trustedContract,
): CheckRecord[] {
  const context = evidenceContext(hosted ? hostedEnv : localEnv, {
    root, contract: candidateContract, plan: candidatePlan,
  });
  if (candidatePlan.requiredChecks.includes("browser-plan-canary")) {
    const source = {
      repository: context.repository,
      taskId: context.taskId,
      contractDigest: context.contractDigest,
      planDigest: context.planDigest,
      headSha: context.headSha,
      baseSha: context.baseSha,
      pullRequest: context.pullRequest,
      runId: context.runId,
      runAttempt: context.runAttempt,
      evidenceRunId: "91",
    };
    write("artifacts/browser-plan-canary.json", JSON.stringify({
      schema: "northstar/browser-plan-canary/1",
      criterionIds: ["AC15"],
      verifiedAt: "2026-09-03T10:00:00.000Z",
      source,
      canary: {
        pullRequest: 8,
        url: "https://github.com/webmaxru/northstar-orders-api-demo/pull/8",
        planAuthor: "fixture-author",
        headSha: "e".repeat(40),
        baseSha: "c".repeat(40),
        planDigest: "d".repeat(64),
        artifactPath: `docs/plans/${candidateContract.id.toLowerCase()}.md`,
        artifactBlobSha: "f".repeat(40),
        reviewId: 23,
        reviewer: "fixture-reviewer",
        reviewedCommit: "e".repeat(40),
        reviewState: "APPROVED",
        approvedAt: "2026-09-03T09:00:00.000Z",
        canaryFor: {
          sourceTaskId: source.taskId,
          sourceContractDigest: source.contractDigest,
          sourcePlanDigest: source.planDigest,
          sourceBaseSha: source.baseSha,
          sourcePullRequest: source.pullRequest,
          sourceHeadSha: source.headSha,
          sourceRunId: source.runId,
          sourceRunAttempt: source.runAttempt,
          sourceEvidenceRunId: source.evidenceRunId,
          bootstrapPlanPr: 15,
          bootstrapPlanHeadSha: "a".repeat(40),
          bootstrapReviewId: 16,
          bootstrapReviewer: "bootstrap-reviewer",
        },
      },
    }));
  }
  return candidatePlan.requiredChecks.filter((id) => id !== "evidence").map((id) => {
    const artifact = CHECK_ARTIFACTS[id]?.[0] ?? null;
    return {
      schema: "northstar/check-evidence/1", id, category: "execution",
      status: "pass", required: true, summary: "Offline producer fixture.",
      artifact, artifactDigest: digestPath(artifact, root), producedAt: new Date().toISOString(),
      provenance: {
        ...context, job: id,
        ...(hosted && !revalidated.has(id) ? {
          workflow: "Governed Change", event: "pull_request", actor: "fixture-producer",
          executionRunId: "42", executionRunAttempt: "2",
        } : {}),
      },
    };
  });
}

function report(input: {
  records?: CheckRecord[];
  hosted?: boolean;
  plan?: PlanContract | null;
  trusted?: boolean;
  contract?: TaskContract;
  env?: Record<string, string | undefined>;
} = {}) {
  const reportContract = input.contract ?? (input.trusted === false ? contract : trustedContract);
  const reportPlan = input.plan === undefined ? plan : input.plan;
  return buildExecutionReport({
    contract: reportContract,
    plan: reportPlan,
    records: input.records ?? records(input.hosted, reportPlan ?? plan, reportContract),
    unit: readJUnit("artifacts/unit-junit.xml", root),
    acceptance: readJUnit("artifacts/acceptance-junit.xml", root),
    hosted: input.hosted ?? false,
    env: input.env ?? (input.hosted ? hostedEnv : localEnv),
    root,
  });
}

describe("fail-closed execution evidence", () => {
  it("summarizes failed check reason codes without echoing producer text", () => {
    expect(checkFailureDiagnostics([
      { id: "scope-policy", status: "fail", reasons: ["artifact unreadable or malformed: hidden\ntext"] },
      { id: "repository-controls", status: "fail", reasons: [] },
      { id: "quality", status: "pass", reasons: [] },
    ], ["scope-policy", "repository-controls"])).toEqual([
      "scope-policy: artifact unreadable or malformed",
      "repository-controls: status fail",
    ]);
  });

  it("rejects missing artifacts and mismatched base or attempt", () => {
    const passing = records();
    expect(report({ records: passing }).decision).toBe("ready_for_review");
    const original = readFileSync(join(root, "artifacts/governance-report.json"), "utf8");
    rmSync(join(root, "artifacts/governance-report.json"));
    const missing = passing.map((record) => record.id === "governance-policy"
      ? { ...record, artifactDigest: null } : record);
    expect(report({ records: missing })).toMatchObject({
      decision: "review_required", failedLocalChecks: expect.arrayContaining(["governance-policy"]),
    });
    expect(report({ records: missing }).checks.find(({ id }) => id === "governance-policy")?.reasons)
      .toContain("artifact missing or empty directory");
    write("artifacts/governance-report.json", original);
    for (const change of [{ baseSha: "c".repeat(40) }, { runAttempt: "1" }]) {
      const mismatched = passing.map((record) => record.id === "quality"
        ? { ...record, provenance: { ...record.provenance, ...change } } : record);
      expect(report({ records: mismatched })).toMatchObject({
        decision: "review_required", failedLocalChecks: expect.arrayContaining(["quality"]),
      });
    }
  });

  it("accepts current PR plan and scope producers for review but requires trusted revalidation for acceptance", () => {
    const candidateEnv = {
      ...hostedEnv,
      NORTHSTAR_RUN_ID: "42",
      NORTHSTAR_RUN_ATTEMPT: "2",
      GITHUB_RUN_ID: "42",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_WORKFLOW: "Governed Change",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_ACTOR: "fixture-producer",
    };
    const candidateRecords = records(true).map((record) => {
      if (!["plan-contract", "scope-policy"].includes(record.id)) return record;
      return createCheckRecord({
        id: record.id,
        status: "pass",
        category: "policy",
        artifact: record.artifact,
      }, { ...candidateEnv, NORTHSTAR_JOB_ID: record.id }, {
        root, contract: trustedContract, plan,
      });
    });
    const result = report({
      records: candidateRecords,
      hosted: true,
      env: candidateEnv,
    });
    expect(result.failedLocalChecks).not.toContain("plan-contract");
    expect(result.failedLocalChecks).not.toContain("scope-policy");
    expect(result.decision).toBe("ready_for_review");
    expect(result.pendingHostedEvidence).toContain("human-review");

    const publisherContext = report({
      records: candidateRecords,
      hosted: true,
      env: hostedEnv,
    });
    expect(publisherContext.checks.find(({ id }) => id === "plan-contract")?.reasons)
      .toContain("trusted current-run revalidation missing");
  });

  it("matches proving tests by stable leaf name, not substring", () => {
    const criterion = contract.successCriteria[0]!;
    expect(criterionCoverage([criterion], [`suite > ${criterion.provenBy} extra`])[0]?.proven).toBe(false);
    expect(criterionCoverage([criterion], [`suite > ${criterion.provenBy}`])[0]?.proven).toBe(true);
  });

  it("keeps a post-acceptance criterion explicitly unverified while permitting review readiness", () => {
    const deferredCriterion = {
      id: "AC7",
      statement: "A browser-only plan approval is recorded after repair acceptance.",
      provenBy: "proves browser-only plan approval end to end",
    };
    const deferredContract: TaskContract = {
      ...trustedContract,
      source: { ...trustedContract.source, bodyDigest: "e".repeat(64) },
      successCriteria: [...trustedContract.successCriteria, deferredCriterion],
    };
    const deferral = {
      id: deferredCriterion.id,
      stage: "post-acceptance" as const,
      reason: "The browser canary runs after repair acceptance.",
      evidence: "Bind the native review to the original task, plan, base, and implementation head.",
    };
    const deferredPlan: PlanContract = {
      ...plan,
      contractDigest: deferredContract.source.bodyDigest,
      successCriteria: [
        ...plan.successCriteria,
        { id: deferredCriterion.id, provenBy: deferredCriterion.provenBy },
      ],
      deferredCriteria: [deferral],
    };
    deferredPlan.planDigest = planDigest(deferredPlan);
    write("artifacts/unit-junit.xml", junit([
      ...contract.successCriteria.map(({ provenBy }) => provenBy),
      deferredCriterion.provenBy,
    ]));
    write("artifacts/plan.json", JSON.stringify(deferredPlan));
    write("artifacts/approved-plan.json", JSON.stringify(deferredPlan));
    write("artifacts/candidate-plan.json", JSON.stringify(deferredPlan));
    write("artifacts/scope-report.json", JSON.stringify({
      schema: "northstar/scope-report/1",
      taskId: deferredContract.id,
      contractDigest: deferredContract.source.bodyDigest,
      paths: [],
      violations: [],
      ok: true,
    }));

    const result = report({
      contract: deferredContract,
      plan: deferredPlan,
      hosted: true,
      records: records(true, deferredPlan, deferredContract),
    });

    expect(result.decision).toBe("ready_for_review");
    expect(result.unprovenCriteria).toContain("AC7");
    expect(result.successCriteria.find(({ id }) => id === "AC7")?.proven).toBe(false);
    expect(result.deferredCriteria).toEqual([{ ...deferral, status: "unverified" }]);
  });

  it("proves only AC15 when a valid trusted browser-canary record is present", () => {
    const deferredCriterion = {
      id: "AC15",
      statement: "A current browser-only plan approval is bound to the original implementation.",
      provenBy: "proves browser-only plan approval end to end",
    };
    const deferredContract: TaskContract = {
      ...trustedContract,
      source: { ...trustedContract.source, bodyDigest: "9".repeat(64) },
      successCriteria: [...trustedContract.successCriteria, deferredCriterion],
    };
    const deferral = {
      id: deferredCriterion.id,
      stage: "post-acceptance" as const,
      reason: "The canary follows controlled bootstrap activation.",
      evidence: "Verify the current native review and original source binding.",
    };
    const deferredPlan: PlanContract = {
      ...plan,
      contractDigest: deferredContract.source.bodyDigest,
      requiredChecks: [...plan.requiredChecks, "browser-plan-canary"],
      successCriteria: [
        ...plan.successCriteria,
        { id: deferredCriterion.id, provenBy: deferredCriterion.provenBy },
      ],
      deferredCriteria: [deferral],
    };
    deferredPlan.planDigest = planDigest(deferredPlan);
    write("artifacts/unit-junit.xml", junit([
      ...contract.successCriteria.map(({ provenBy }) => provenBy),
      deferredCriterion.provenBy,
    ]));
    write("artifacts/plan.json", JSON.stringify(deferredPlan));
    write("artifacts/approved-plan.json", JSON.stringify(deferredPlan));
    write("artifacts/candidate-plan.json", JSON.stringify(deferredPlan));
    write("artifacts/scope-report.json", JSON.stringify({
      schema: "northstar/scope-report/1",
      taskId: deferredContract.id,
      contractDigest: deferredContract.source.bodyDigest,
      paths: [],
      violations: [],
      ok: true,
    }));

    const passingRecords = records(true, deferredPlan, deferredContract);
    const accepted = report({
      contract: deferredContract,
      plan: deferredPlan,
      hosted: true,
      records: passingRecords,
    });
    expect(accepted.decision).toBe("ready_for_acceptance");
    expect(accepted.successCriteria.find(({ id }) => id === "AC15")?.proven).toBe(true);
    expect(accepted.deferredCriteria).toEqual([{ ...deferral, status: "proven" }]);

    const missingCanary = report({
      contract: deferredContract,
      plan: deferredPlan,
      hosted: true,
      records: passingRecords.filter(({ id }) => id !== "browser-plan-canary"),
    });
    expect(missingCanary.decision).toBe("ready_for_review");
    expect(missingCanary.unprovenCriteria).toContain("AC15");
    expect(missingCanary.pendingHostedEvidence).toContain("browser-plan-canary");
  });

  it("fails closed on malformed deferred criteria in an execution report", () => {
    const malformedPlan = {
      ...plan,
      deferredCriteria: [null],
    } as unknown as PlanContract;
    malformedPlan.planDigest = planDigest(malformedPlan);
    write("artifacts/plan.json", JSON.stringify(malformedPlan));
    write("artifacts/approved-plan.json", JSON.stringify(malformedPlan));
    write("artifacts/candidate-plan.json", JSON.stringify(malformedPlan));

    const result = report({
      plan: malformedPlan,
      hosted: true,
      records: records(true, malformedPlan),
    });

    expect(result.decision).toBe("review_required");
    expect(result.plan.valid).toBe(false);
    expect(result.deferredCriteria).toEqual([]);
  });

  it("does not defer an unproven criterion unless the approved plan names it", () => {
    const deferredCriterion = {
      id: "AC7",
      statement: "A browser-only plan approval is recorded after repair acceptance.",
      provenBy: "proves browser-only plan approval end to end",
    };
    const deferredContract: TaskContract = {
      ...trustedContract,
      source: { ...trustedContract.source, bodyDigest: "f".repeat(64) },
      successCriteria: [...trustedContract.successCriteria, deferredCriterion],
    };
    const nonDeferredPlan: PlanContract = {
      ...plan,
      contractDigest: deferredContract.source.bodyDigest,
      successCriteria: [
        ...plan.successCriteria,
        { id: deferredCriterion.id, provenBy: deferredCriterion.provenBy },
      ],
    };
    nonDeferredPlan.planDigest = planDigest(nonDeferredPlan);
    write("artifacts/plan.json", JSON.stringify(nonDeferredPlan));
    write("artifacts/approved-plan.json", JSON.stringify(nonDeferredPlan));
    write("artifacts/scope-report.json", JSON.stringify({
      schema: "northstar/scope-report/1",
      taskId: deferredContract.id,
      contractDigest: deferredContract.source.bodyDigest,
      paths: [],
      violations: [],
      ok: true,
    }));

    const result = report({
      contract: deferredContract,
      plan: nonDeferredPlan,
      hosted: true,
      records: records(true, nonDeferredPlan, deferredContract),
    });

    expect(result.decision).toBe("review_required");
    expect(result.unprovenCriteria).toContain("AC7");
    expect(result.deferredCriteria).toEqual([]);
  });

  it("does not count skipped testcases as criterion evidence", () => {
    const parsed = parseJUnit(`<testsuites><testsuite tests="1" failures="0" errors="0" skipped="1">
      <testcase name="suite &gt; replays the original response across instances"><skipped /></testcase>
    </testsuite></testsuites>`);
    expect(parsed.testNames).toEqual([]);
    expect(parsed.skippedTestNames).toEqual(["suite > replays the original response across instances"]);
  });

  it.each([
    "", "not XML", "<testsuites/>", '<testsuite tests="1" failures="0" errors="0"/>',
    '<testsuite tests="1" failures="0" errors="0"><testcase name="passing"><failure/></testcase></testsuite>',
    '<testsuite tests="1" failures="0" errors="0"><testcase name="passing"></testsuite>',
    '<testsuite tests="1" failures="0" errors="0"><testcase/></testsuite>',
    '<testsuite tests="1" tests="1" failures="0" errors="0"><testcase name="passing"/></testsuite>',
    '<testsuite tests="1" failures="0" errors="0"><system-out><testcase name="passing"/></system-out></testsuite>',
  ])("rejects malformed or contradictory JUnit: %s", (xml) => {
    expect(parseJUnit(xml)).toMatchObject({ passed: false, testNames: [] });
    expect(parseJUnit(xml).validationErrors?.length).toBeGreaterThan(0);
  });

  it("rejects an empty acceptance suite", () => {
    write("artifacts/acceptance-junit.xml", junit([]));
    expect(report().decision).toBe("review_required");
  });

  it("rejects an entirely skipped acceptance suite even when unit tests cover the criteria", () => {
    write("artifacts/acceptance-junit.xml", '<testsuite tests="1" failures="0" errors="0" skipped="1"><testcase name="not executed"><skipped/></testcase></testsuite>');
    expect(report().decision).toBe("review_required");
  });

  it("does not trust a caller's passing summary instead of the actual JUnit", () => {
    const old = readJUnit("artifacts/unit-junit.xml", root);
    const currentRecords = records();
    write("artifacts/unit-junit.xml", "<not-junit/>");
    const result = buildExecutionReport({
      contract: trustedContract, plan, records: currentRecords, unit: old,
      acceptance: readJUnit("artifacts/acceptance-junit.xml", root),
      hosted: false, env: localEnv, root,
    });
    expect(result.decision).toBe("review_required");
    expect(result.tests.unit.passed).toBe(false);
  });

  it("reaches ready_for_review locally while naming hosted evidence still pending", () => {
    const localOnly = records().filter(({ id }) =>
      !["plan-approval", "codeql", "validation-authority", "repository-controls", "human-review"].includes(id));
    expect(report({ records: localOnly })).toMatchObject({
      decision: "ready_for_review",
      pendingHostedEvidence: ["plan-approval", "codeql", "validation-authority", "repository-controls", "human-review"],
    });
  });

  it("preserves explicitly untrusted fixture rehearsal without granting hosted acceptance", () => {
    expect(report({ trusted: false })).toMatchObject({
      decision: "ready_for_review", limits: expect.arrayContaining([expect.stringContaining("offline fixture")]),
    });
    expect(report({ trusted: false, hosted: true }).decision).not.toBe("ready_for_acceptance");
  });

  it("rejects local evidence when evaluated as hosted evidence", () => {
    expect(report({ records: records(), hosted: true }).decision).toBe("review_required");
  });

  it("fails on a red dependency gate", () => {
    expect(report({ records: records().map((record) => record.id === "dependency-review"
      ? { ...record, status: "fail" } : record) })).toMatchObject({
      decision: "review_required", failedLocalChecks: expect.arrayContaining(["dependency-review"]),
    });
  });

  it.each([
    ["taskId", "another-task"], ["contractDigest", "c".repeat(64)],
    ["planDigest", "d".repeat(64)], ["baseSha", "d".repeat(40)],
    ["headSha", "d".repeat(40)], ["runId", "another-run"],
    ["runAttempt", "1"], ["repository", "another/repository"],
    ["executionRunId", "another-run"], ["executionRunAttempt", "1"], ["job", "acceptance"],
  ])("rejects cross-identity evidence for %s", (field, value) => {
    const altered = records().map((record) => record.id === "quality"
      ? { ...record, provenance: { ...record.provenance, [field]: value } } : record);
    expect(report({ records: altered })).toMatchObject({
      decision: "review_required", failedLocalChecks: expect.arrayContaining(["quality"]),
    });
  });

  it("rejects incomplete identities even when both sides omit the same value", () => {
    const altered = records().map((record) => ({
      ...record, provenance: { ...record.provenance, baseSha: null, runAttempt: null },
    }));
    expect(report({ records: altered, env: { ...hostedEnv, NORTHSTAR_RUN_ATTEMPT: undefined, GITHUB_RUN_ATTEMPT: undefined }, hosted: true })
      .decision).toBe("review_required");
  });

  it("rejects duplicate records and hosted records with missing run identity", () => {
    const altered = records(true).map((record) => record.id === "quality"
      ? { ...record, provenance: { ...record.provenance, runId: "" } } : record);
    const result = report({ records: [...altered, check("acceptance", "pass", true)], hosted: true });
    expect(result.decision).toBe("review_required");
    expect(result.checks.find(({ id }) => id === "acceptance")?.reasons).toContain("duplicate evidence");
    expect(result.checks.find(({ id }) => id === "quality")?.reasons).toContain("workflow run mismatch or missing");
  });

  it("requires validation authority for hosted acceptance regardless of plan risk", () => {
    const medium: PlanContract = {
      ...plan, risk: "medium",
      requiredChecks: requiredChecks.filter((id) => !["plan-approval", "codeql", "governance-policy", "validation-authority", "repository-controls"].includes(id)),
    };
    medium.planDigest = planDigest(medium);
    write("artifacts/plan.json", JSON.stringify(medium));
    expect(report({ plan: medium, records: records(true, medium), hosted: true })).toMatchObject({
      decision: "ready_for_review", pendingHostedEvidence: ["validation-authority"],
    });
  });

  it("reaches ready_for_acceptance only when every hosted check passes", () => {
    expect(report({ hosted: true })).toMatchObject({
      decision: "ready_for_acceptance", failedLocalChecks: [], pendingHostedEvidence: [],
    });
  });

  it("does not allow source-run records to certify their own validation authority", () => {
    const altered = records(true).map((record) => record.id === "validation-authority" ? {
      ...record, provenance: {
        ...record.provenance, workflow: "Governed Change", event: "pull_request",
        actor: "fixture-producer", executionRunId: "42", executionRunAttempt: "2",
      },
    } : record);
    expect(report({ records: altered, hosted: true })).toMatchObject({
      decision: "ready_for_review", pendingHostedEvidence: ["validation-authority"],
    });
  });

  it("retains protected-maintenance semantics without letting a publisher pass a failed authority report", () => {
    write("artifacts/validation-authority-report.json", JSON.stringify({
      schema: "northstar/validation-authority-report/1", headSha, pullRequest: 7,
      ok: false, changedAuthority: ["scripts/evidence-record.mjs"],
    }));
    const env = {
      ...hostedEnv, GITHUB_WORKFLOW: "System Maintenance Approval",
      GITHUB_RUN_ID: "901", GITHUB_RUN_ATTEMPT: "1", GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR: "fixture-maintenance",
    };
    const maintained = records(true).map((record) => revalidated.has(record.id)
      ? createCheckRecord({
          id: record.id, status: "pass", category: record.id === "validation-authority" ? "approval" : "policy",
          artifact: record.artifact,
        }, { ...env, NORTHSTAR_JOB_ID: record.id }, { root, contract: trustedContract, plan })
      : record);
    expect(report({ records: maintained, hosted: true, env }).decision).toBe("ready_for_acceptance");
    const publisher = maintained.map((record) => revalidated.has(record.id) ? {
      ...record, provenance: {
        ...record.provenance, workflow: "Publish Evidence", event: "workflow_run",
        actor: "fixture-publisher", executionRunId: "900", executionRunAttempt: "9",
      },
    } : record);
    expect(report({ records: publisher, hosted: true }).pendingHostedEvidence).toContain("validation-authority");
  });

  it("binds evidence to clean source rather than HEAD alone", () => {
    const clean = records();
    write("source.txt", "dirty tracked source\n");
    expect(readSourceState(root)).toEqual({ headSha, dirty: true });
    expect(report({ records: clean }).contextErrors).toContain("Source worktree is dirty; evidence is not commit-bound.");
    const dirty = records();
    write("source.txt", "committed source\n");
    expect(report({ records: dirty })).toMatchObject({
      decision: "review_required", failedLocalChecks: expect.arrayContaining(["quality"]),
    });

    write("untracked.txt", "uncommitted source");
    expect(report({ records: clean }).decision).toBe("review_required");
  });

  it("does not confuse data-only workflow downloads with untracked executable source", () => {
    write("incoming-evidence/unit-junit.xml", junit());
    expect(readSourceState(root).dirty).toBe(false);
    write("incoming-evidence/source.mjs", "export const changed = true;");
    expect(readSourceState(root).dirty).toBe(true);
  });

  it.each([
    ["governance-policy", "artifacts/governance-report.json", {}],
    ["dependency-review", "artifacts/dependency-audit.json", { metadata: { vulnerabilities: { high: 1, critical: 0 } } }],
    ["codeql", "artifacts/codeql/results.sarif", { runs: [] }],
    ["scope-policy", "artifacts/scope-report.json", { schema: "northstar/scope-report/1", ok: true }],
  ])("rejects syntactically valid but malformed or failed %s artifacts", (id, path, value) => {
    const old = records(true);
    write(path, JSON.stringify(value));
    const changed = old.map((record) => record.id === id
      ? { ...record, artifactDigest: digestPath(record.artifact, root) } : record);
    const result = report({ records: changed, hosted: true });
    expect(result.decision).not.toBe("ready_for_acceptance");
    expect(result.checks.find((check) => check.id === id)?.valid).toBe(false);
  });

  it("rejects missing, changed, malformed, and digestless artifacts explicitly", () => {
    const clean = records();
    write("artifacts/governance-report.json", "{");
    const altered = clean.map((record) => record.id === "governance-policy"
      ? { ...record, artifactDigest: digestPath(record.artifact, root) } : record);
    expect(report({ records: altered }).failedLocalChecks).toContain("governance-policy");
    expect(report({ records: clean }).failedLocalChecks).toContain("governance-policy");
    rmSync(join(root, "artifacts/unit-junit.xml"));
    expect(() => check("quality")).toThrow(/Cannot record passing quality evidence/);
    expect(report({ records: clean }).decision).toBe("review_required");
    expect(report({ records: clean.map((record) => ({ ...record, artifactDigest: null })) }).decision).toBe("review_required");
  });

  it("rejects malformed check files and cannot escape the evidence root", () => {
    write("artifacts/checks/quality.json", "null");
    expect(() => loadCheckRecords("artifacts/checks", root)).toThrow(/Malformed evidence/);
    expect(() => digestPath("../outside", root)).toThrow(/inside the repository/);
  });

  it("rejects stale records inside a new Stop invocation", () => {
    const old = records().map((record) => ({ ...record, producedAt: "2020-01-01T00:00:00Z" }));
    expect(report({ records: old, env: { ...localEnv, NORTHSTAR_VALIDATION_STARTED_AT: new Date().toISOString() } })
      .failedLocalChecks).toContain("quality");
  });

  it("does not accept arbitrary loaded JSON as a valid plan", () => {
    expect(report({ plan: null }).decision).toBe("review_required");
    const changed = { ...plan, steps: [] };
    expect(report({ plan: changed })).toMatchObject({ decision: "review_required", plan: { valid: false } });
  });

  it("requires complete hosted context independently of passing records", () => {
    expect(report({ records: records(true), hosted: true, env: { ...hostedEnv, GITHUB_RUN_ATTEMPT: undefined } })
      .decision).toBe("review_required");
    expect(evidenceContext(localEnv, { root, contract, plan }).source).toEqual({ headSha, dirty: false });
  });
});
