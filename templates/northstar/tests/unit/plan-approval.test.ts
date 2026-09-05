import { describe, expect, it } from "vitest";
import {
  evaluateFinalApproval,
  evaluatePlanApproval,
  latestReviewsByUser,
  parseApprovalRecord,
  renderApprovalRecord,
  type ApprovalRecord,
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

function record(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
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
