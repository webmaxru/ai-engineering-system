import { describe, expect, it } from "vitest";
import {
  buildBrowserPlanCanaryEvidence,
  type BrowserPlanCanaryEvidence,
} from "../../scripts/browser-plan-canary.mjs";
import type { NativeApprovalRecord, LegacyApprovalRecord } from "../../scripts/plan-approval.mjs";
import { planDigest, type PlanContract } from "../../scripts/plan-contract.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import type { TaskContract } from "../../scripts/task-contract.mjs";
import { requiredChecksForRisk } from "../../scripts/risk-policy.mjs";
import type { PlanPr } from "../../scripts/publish-plan.mjs";

const repository = "webmaxru/northstar-orders-api-demo";
const sourceHead = "c".repeat(40);
const sourceBase = "b".repeat(40);
const bootstrapHead = "f".repeat(40);
const canaryHead = "7".repeat(40);
const canaryBase = "8".repeat(40);
const evidenceRunId = "9002";

function fixture() {
  const base = contractFromFile("tests/fixtures/WI-1842.issue.md");
  const contract: TaskContract = {
    ...base,
    source: { ...base.source, bodyDigest: "a".repeat(64) },
    inputs: {
      ...base.inputs,
      scope: {
        ...base.inputs.scope,
        allowed: [...base.inputs.scope.allowed, "docs/plans/**"],
      },
    },
    successCriteria: [
      ...base.successCriteria,
      {
        id: "AC15",
        statement: "A current browser plan approval is bound to the original change.",
        provenBy: "proves browser-only plan approval end to end",
      },
    ],
  };
  const sourcePlan: PlanContract = {
    schema: "northstar/plan/1",
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    baseBranch: "main",
    baseSha: sourceBase,
    risk: "high",
    objective: contract.inputs.goal,
    scope: { allowed: [contract.inputs.scope.allowed[0]!], prohibited: [] },
    steps: ["Repair the approved implementation."],
    successCriteria: contract.successCriteria.map(({ id, provenBy }) => ({ id, provenBy })),
    deferredCriteria: [{
      id: "AC15",
      stage: "post-acceptance",
      reason: "The browser canary follows controlled bootstrap activation.",
      evidence: "Bind its current native review to the original task and implementation.",
    }],
    requiredChecks: [...new Set([...requiredChecksForRisk("high"), "browser-plan-canary"])],
    evidence: ["Exact workflow and review evidence."],
    decisionsAndHandoffs: ["Human reviewers accept the plan before execution."],
    risks: ["Missing canary evidence blocks final acceptance."],
    rollbackAndEscalation: ["Keep trusted acceptance failed until the canary is verified."],
  };
  sourcePlan.planDigest = planDigest(sourcePlan);
  const sourceApproval: LegacyApprovalRecord = {
    schema: "northstar/plan-approval/1",
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    planDigest: planDigest(sourcePlan),
    planPr: 15,
    planUrl: `https://github.com/${repository}/pull/15`,
    reviewId: 101,
    reviewer: "vibeprogrammer",
    reviewedCommit: bootstrapHead,
    baseSha: sourceBase,
    approvedAt: "2026-09-01T10:00:00Z",
    planOnly: true,
  };
  const approvedSourcePlan = { ...sourcePlan, approval: sourceApproval };
  const sourceRun = {
    schema: "northstar/source-run/1",
    repository,
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    planDigest: planDigest(sourcePlan),
    pullRequest: 18,
    headSha: sourceHead,
    baseSha: sourceBase,
    runId: "9001",
    runAttempt: "2",
  };
  const canaryFor = {
    sourceTaskId: contract.id,
    sourceContractDigest: contract.source.bodyDigest,
    sourcePlanDigest: planDigest(sourcePlan),
    sourceBaseSha: sourceBase,
    sourcePullRequest: 18,
    sourceHeadSha: sourceHead,
    sourceRunId: "9001",
    sourceRunAttempt: "2",
    sourceEvidenceRunId: evidenceRunId,
    bootstrapPlanPr: sourceApproval.planPr,
    bootstrapPlanHeadSha: sourceApproval.reviewedCommit,
    bootstrapReviewId: sourceApproval.reviewId,
    bootstrapReviewer: sourceApproval.reviewer,
  };
  const canaryPlan: PlanContract = {
    ...sourcePlan,
    baseSha: canaryBase,
    scope: { allowed: ["docs/plans/**"], prohibited: [] },
    canaryFor,
  };
  canaryPlan.planDigest = planDigest(canaryPlan);
  const canaryApproval: NativeApprovalRecord = {
    schema: "northstar/plan-approval/2",
    source: "github-review",
    repository,
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    planDigest: planDigest(canaryPlan),
    planPr: 25,
    planUrl: `https://github.com/${repository}/pull/25`,
    reviewId: 202,
    reviewer: "vibeprogrammer",
    reviewedCommit: canaryHead,
    baseSha: canaryBase,
    approvedAt: "2026-09-02T10:00:00Z",
    planOnly: true,
    artifactPath: `docs/plans/${contract.id.toLowerCase()}.md`,
    artifactBlobSha: "9".repeat(40),
  };
  const canaryPr: PlanPr = {
    number: 25,
    body: "Plan-only browser canary.",
    url: `https://github.com/${repository}/pull/25`,
    author: { login: "webmaxru" },
    headRefOid: canaryHead,
    baseRefOid: canaryBase,
    headRefName: `plan/${contract.id.toLowerCase()}-canary`,
    baseRefName: "main",
    isDraft: false,
    state: "open",
  };
  return {
    input: {
      repository,
      contract,
      sourcePlan: approvedSourcePlan,
      sourceRun,
      sourcePull: {
        number: 18,
        head: { sha: sourceHead, repo: { full_name: repository } },
        base: { ref: "main", repo: { full_name: repository } },
        merged: true,
        merge_commit_sha: "d".repeat(40),
      },
      sourceMergeComparison: {
        merge_base_commit: { sha: sourceBase },
        total_commits: 1,
        commits: [{ sha: "d".repeat(40) }],
        status: "ahead",
      },
      sourceRunInfo: {
        id: 9001,
        run_attempt: 2,
        repository: { full_name: repository },
        path: ".github/workflows/governed-change.yml",
        event: "pull_request",
        status: "completed",
        head_sha: sourceHead,
        pull_requests: [{ number: 18 }],
      },
      evidenceRunInfo: {
        id: Number(evidenceRunId),
        repository: { full_name: repository },
        path: ".github/workflows/publish-evidence.yml",
        event: "workflow_run",
        status: "completed",
        conclusion: "success",
      },
      evidenceRunId,
      canarySelection: { plan: canaryPlan, approval: canaryApproval, pr: canaryPr },
      canaryPlanNumber: 25,
      canaryHeadSha: canaryHead,
    },
  };
}

describe("protected browser plan canary evidence", () => {
  it("binds an exact native canary review to the original approved task and source runs", () => {
    const evidence: BrowserPlanCanaryEvidence = buildBrowserPlanCanaryEvidence(fixture().input);

    expect(evidence).toMatchObject({
      schema: "northstar/browser-plan-canary/1",
      criterionIds: ["AC15"],
      source: {
        taskId: "WI-1842",
        pullRequest: 18,
        headSha: sourceHead,
        baseSha: sourceBase,
        runId: "9001",
        runAttempt: "2",
        evidenceRunId,
      },
      canary: {
        pullRequest: 25,
        headSha: canaryHead,
        baseSha: canaryBase,
        planAuthor: "webmaxru",
        reviewer: "vibeprogrammer",
        reviewedCommit: canaryHead,
        reviewState: "APPROVED",
        canaryFor: {
          sourcePullRequest: 18,
          sourceHeadSha: sourceHead,
          sourceRunId: "9001",
          sourceEvidenceRunId: evidenceRunId,
          bootstrapPlanPr: 15,
          bootstrapReviewId: 101,
        },
      },
    });
  });

  it("rejects a canary head different from the reviewed immutable plan commit", () => {
    const { input } = fixture();
    expect(() =>
      buildBrowserPlanCanaryEvidence({ ...input, canaryHeadSha: "6".repeat(40) }),
    ).toThrow(/canary plan PR, immutable head/i);
  });

  it("rejects a canary PR URL that does not identify the verified repository and number", () => {
    const { input } = fixture();
    input.canarySelection!.pr.url = `https://github.com/attacker/repository/pull/${input.canaryPlanNumber}`;
    expect(() => buildBrowserPlanCanaryEvidence(input)).toThrow(/canary plan PR, immutable head/i);
  });

  it("rejects a merge commit that does not descend from the validated source base", () => {
    const { input } = fixture();
    expect(() => buildBrowserPlanCanaryEvidence({
      ...input,
      sourceMergeComparison: {
        merge_base_commit: { sha: "1".repeat(40) },
        total_commits: 1,
        commits: [{ sha: "2".repeat(40) }],
        status: "diverged",
      },
    })).toThrow(/merge commit is not on the verified source base ancestry/i);
  });
});
