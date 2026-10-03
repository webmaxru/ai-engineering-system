import { describe, expect, it } from "vitest";
import {
  evaluateFinalApproval,
  evaluateNativePlanApproval,
  evaluatePlanApproval,
  latestReviewsByUser,
  parseApprovalRecord,
  renderApprovalRecord,
  type LegacyApprovalRecord,
  type Review,
} from "../../scripts/plan-approval.mjs";
import { planDigest, type PlanContract } from "../../scripts/plan-contract.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";

const contract = contractFromFile("tests/fixtures/WI-1842.issue.md");
const plan: PlanContract = {
  schema: "northstar/plan/1",
  taskId: contract.id,
  contractDigest: contract.source.bodyDigest,
  baseBranch: "main",
  baseSha: "a".repeat(40),
  risk: "high",
  objective: contract.inputs.goal,
  scope: { allowed: ["src/services/order-service.ts"], prohibited: [] },
  steps: ["Implement the approved change."],
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
  evidence: ["Execution report."],
  decisionsAndHandoffs: ["Planner to implementer."],
  risks: ["Concurrency."],
  rollbackAndEscalation: ["Revert or escalate."],
};

const review: Review = {
  id: 91,
  state: "APPROVED",
  submitted_at: "2026-09-04T10:00:00Z",
  commit_id: "b".repeat(40),
  user: { login: "reviewer", type: "User" },
};

function record(overrides: Partial<LegacyApprovalRecord> = {}): LegacyApprovalRecord {
  return {
    schema: "northstar/plan-approval/1",
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    planDigest: planDigest(plan),
    planPr: 12,
    planUrl: "https://example.invalid/pull/12",
    reviewId: 91,
    reviewer: "reviewer",
    reviewedCommit: "b".repeat(40),
    baseSha: "a".repeat(40),
    approvedAt: "2026-09-04T10:00:00Z",
    planOnly: true,
    commentAuthor: "reviewer",
    ...overrides,
  };
}

describe("human plan approval", () => {
  it("round-trips a durable approval record", () => {
    expect(parseApprovalRecord(renderApprovalRecord(record()))).toEqual(record());
  });

  describe("native approval of an immutable plan artifact", () => {
    const input = {
      plan,
      contract,
      pr: {
        number: 12, url: "https://github.com/example/reference/pull/12",
        body: "", author: { login: "agent-author" }, isDraft: false,
        headRefOid: "b".repeat(40), baseRefOid: "a".repeat(40),
      },
      reviews: [review],
      files: [{ filename: "docs/plans/wi-1842.md", status: "added", sha: "c".repeat(40) }],
      entry: { path: "wi-1842.md", type: "blob", mode: "100644", sha: "c".repeat(40) },
      eligibleReviewers: ["reviewer"],
      repository: "example/reference",
    };

    it("binds native review to the immutable plan and task", () => {
      expect(evaluateNativePlanApproval(input)).toMatchObject({
        ok: true,
        record: {
          schema: "northstar/plan-approval/2",
          source: "github-review",
          reviewId: review.id,
          planDigest: planDigest(plan),
          contractDigest: contract.source.bodyDigest,
          artifactPath: "docs/plans/wi-1842.md",
          artifactBlobSha: "c".repeat(40),
          reviewedCommit: "b".repeat(40),
        },
      });
    });

    it("rejects changed task, plan base, head, and plan-only file set", () => {
      expect(evaluateNativePlanApproval({
        ...input, contract: { ...contract, source: { ...contract.source, bodyDigest: "0".repeat(64) } },
      }).ok).toBe(false);
      expect(evaluateNativePlanApproval({
        ...input, pr: { ...input.pr, baseRefOid: "d".repeat(40) },
      }).ok).toBe(false);
      expect(evaluateNativePlanApproval({
        ...input, pr: { ...input.pr, headRefOid: "d".repeat(40) },
      }).ok).toBe(false);
      expect(evaluateNativePlanApproval({
        ...input, files: [...input.files, { filename: "src/server.ts", status: "modified", sha: "f".repeat(40) }],
      }).ok).toBe(false);
    });

    it("does not turn comments, self-review, bot review, or dismissed review into approval", () => {
      for (const invalidReview of [
        { ...review, state: "COMMENTED" },
        { ...review, state: "DISMISSED" },
        { ...review, user: { login: "reviewer", type: "Bot" } },
        { ...review, user: { login: "agent-author", type: "User" } },
      ]) {
        expect(evaluateNativePlanApproval({ ...input, reviews: [invalidReview] }).ok).toBe(false);
      }
      expect(evaluateNativePlanApproval({ ...input, eligibleReviewers: [] }).ok).toBe(false);
      expect(evaluateNativePlanApproval({
        ...input, pr: { ...input.pr, isDraft: true },
      }).ok).toBe(false);
      expect(evaluateNativePlanApproval({
        ...input, reviews: [review, { ...review, id: 92, state: "CHANGES_REQUESTED", submitted_at: "2026-09-04T12:00:00Z" }],
      }).ok).toBe(false);
    });
  });

  it("accepts a human review bound to the plan-only commit and digests", () => {
    expect(
      evaluatePlanApproval({
        plan,
        contract,
        approvalRecords: [record()],
        reviews: [review],
        prAuthor: "agent-author",
        planHeadSha: "b".repeat(40),
        baseSha: "a".repeat(40),
        planOnlyCommits: ["b".repeat(40)],
      }),
    ).toMatchObject({ ok: true });
  });

  it("rejects a stale plan digest", () => {
    expect(
      evaluatePlanApproval({
        plan,
        contract,
        approvalRecords: [record({ planDigest: "0".repeat(64) })],
        reviews: [review],
        prAuthor: "agent-author",
        planHeadSha: "b".repeat(40),
        baseSha: "a".repeat(40),
        planOnlyCommits: ["b".repeat(40)],
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects a later effective review on the plan pull request", () => {
    const changedReview: Review = {
      ...review,
      id: 92,
      state: "CHANGES_REQUESTED",
      commit_id: "b".repeat(40),
      submitted_at: "2026-09-04T12:00:00Z",
    };
    expect(
      evaluatePlanApproval({
        plan,
        contract,
        approvalRecords: [record()],
        reviews: [review, changedReview],
        prAuthor: "agent-author",
        planHeadSha: "b".repeat(40),
        baseSha: "a".repeat(40),
        planOnlyCommits: ["b".repeat(40)],
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects bot approval and self approval", () => {
    expect(
      evaluateFinalApproval({
        reviews: [
          { ...review, user: { login: "github-copilot[bot]", type: "Bot" } },
          { ...review, id: 92, user: { login: "agent-author", type: "User" } },
        ],
        prAuthor: "agent-author",
        headSha: "b".repeat(40),
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects forged comment authors and dismissed reviews", () => {
    expect(
      evaluatePlanApproval({
        plan,
        contract,
        approvalRecords: [record({ commentAuthor: "someone-else" })],
        reviews: [review],
        prAuthor: "agent-author",
        baseSha: "a".repeat(40),
        planOnlyCommits: ["b".repeat(40)],
      }),
    ).toMatchObject({ ok: false });
    expect(
      evaluatePlanApproval({
        plan,
        contract,
        approvalRecords: [record()],
        reviews: [{ ...review, state: "DISMISSED" }],
        prAuthor: "agent-author",
        baseSha: "a".repeat(40),
        planOnlyCommits: ["b".repeat(40)],
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects an approval that is not proven plan-only or targets another base", () => {
    expect(
      evaluatePlanApproval({
        plan,
        contract,
        approvalRecords: [record()],
        reviews: [review],
        prAuthor: "agent-author",
        baseSha: "a".repeat(40),
        planOnlyCommits: [],
      }),
    ).toMatchObject({ ok: false });
    expect(
      evaluatePlanApproval({
        plan: { ...plan, baseSha: "d".repeat(40) },
        contract,
        approvalRecords: [record()],
        reviews: [review],
        prAuthor: "agent-author",
        baseSha: "a".repeat(40),
        planOnlyCommits: ["b".repeat(40)],
      }),
    ).toMatchObject({ ok: false });
  });

  it("uses each reviewer's latest effective state", () => {
    const changed: Review = {
      ...review,
      id: 92,
      state: "CHANGES_REQUESTED",
      submitted_at: "2026-09-04T11:00:00Z",
    };
    expect(latestReviewsByUser([review, changed])).toEqual([changed]);
    expect(
      evaluateFinalApproval({
        reviews: [review, changed],
        prAuthor: "agent-author",
        headSha: "b".repeat(40),
      }),
    ).toMatchObject({ ok: false });
  });

  it("requires final approval to target the current implementation head", () => {
    expect(
      evaluateFinalApproval({
        reviews: [review],
        prAuthor: "agent-author",
        headSha: "c".repeat(40),
      }),
    ).toMatchObject({ ok: false });
  });
});
