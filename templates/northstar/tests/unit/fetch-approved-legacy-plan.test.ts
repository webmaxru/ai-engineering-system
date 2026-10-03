import { describe, expect, it } from "vitest";
import {
  renderApprovalRecord,
  type LegacyApprovalRecord,
} from "../../scripts/plan-approval.mjs";
import { fetchApprovedPlan, renderPlan } from "../../scripts/publish-plan.mjs";
import { planDigest, renderPlanContract, type PlanContract } from "../../scripts/plan-contract.mjs";
import { requiredChecksForRisk } from "../../scripts/risk-policy.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";

const baseContract = contractFromFile("tests/fixtures/WI-1842.issue.md");
const repository = "webmaxru/northstar-orders-api-demo";
const contract = {
  ...baseContract,
  source: { ...baseContract.source, issue: 4, trusted: true },
};
const approvedBaseSha = "b".repeat(40);
const currentBaseSha = "e".repeat(40);
const planHeadSha = "c".repeat(40);

function fixture() {
  const plan: PlanContract = {
    schema: "northstar/plan/1",
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    baseBranch: "main",
    baseSha: approvedBaseSha,
    risk: "high",
    objective: contract.inputs.goal,
    scope: { allowed: [contract.inputs.scope.allowed[0]!], prohibited: [] },
    steps: ["Use the immutable bootstrap plan for the accepted implementation."],
    successCriteria: contract.successCriteria.map(({ id, provenBy }) => ({ id, provenBy })),
    requiredChecks: requiredChecksForRisk("high"),
    evidence: ["Durable plan review and original approval record."],
    decisionsAndHandoffs: ["The bootstrap plan stays immutable after acceptance."],
    risks: ["The default branch advances after the implementation merges."],
    rollbackAndEscalation: ["Reject any mutation to the pinned plan commit."],
  };
  const digest = planDigest(plan);
  const approval: LegacyApprovalRecord = {
    schema: "northstar/plan-approval/1",
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    planDigest: digest,
    planPr: 15,
    planUrl: `https://github.com/${repository}/pull/15`,
    reviewId: 150,
    reviewer: "vibeprogrammer",
    reviewedCommit: planHeadSha,
    baseSha: approvedBaseSha,
    approvedAt: "2026-09-01T10:00:00Z",
    planOnly: true,
  };
  const review = {
    id: approval.reviewId,
    state: "APPROVED",
    commit_id: planHeadSha,
    user: { login: approval.reviewer, type: "User" },
  };
  const pull = {
    number: 15,
    state: "open",
    draft: false,
    body: renderPlan(renderPlanContract(plan), { issue: 4 }),
    html_url: approval.planUrl,
    user: { login: "webmaxru", type: "User" },
    head: {
      sha: planHeadSha,
      ref: `plan/${contract.id.toLowerCase()}`,
      repo: { full_name: repository },
    },
    base: {
      sha: currentBaseSha,
      ref: "main",
      repo: { full_name: repository },
    },
  };
  const run = (args: string[]) => {
    if (args[0] === "pr" && args[1] === "list") {
      return JSON.stringify([{ number: 15 }]);
    }
    if (args[0] !== "api") throw new Error(`Unexpected GitHub command: ${args.join(" ")}`);
    const route = args.at(-1)!;
    if (route === "repos/{owner}/{repo}") return JSON.stringify({ full_name: repository });
    if (route === "repos/{owner}/{repo}/pulls/15") return JSON.stringify(pull);
    if (args.includes("--paginate")) {
      if (route.includes("/files?")) return JSON.stringify([[]]);
      if (route.includes("/reviews?")) return JSON.stringify([[review]]);
      if (route.includes("/comments?")) {
        return JSON.stringify([[
          {
            id: 151,
            body: renderApprovalRecord(approval),
            user: { login: approval.reviewer, type: "User" },
          },
        ]]);
      }
    }
    if (route === `repos/{owner}/{repo}/compare/${approvedBaseSha}...${planHeadSha}`) {
      return JSON.stringify({
        merge_base_commit: { sha: approvedBaseSha },
        status: "ahead",
        files: [],
      });
    }
    throw new Error(`Unexpected GitHub API route: ${route}`);
  };
  return {
    plan,
    approval,
    pull,
    run,
    legacyPlans: [{
      repository,
      pr: 15,
      headSha: planHeadSha,
      baseSha: approvedBaseSha,
      contractDigest: contract.source.bodyDigest,
      planDigest: digest,
    }],
  };
}

describe("immutable legacy bootstrap plan after base advancement", () => {
  it("keeps the exact pinned plan approval valid after the protected base advances", () => {
    const f = fixture();
    const resolved = fetchApprovedPlan(contract, {
      run: f.run,
      legacyPlans: f.legacyPlans,
    });

    expect(resolved).toMatchObject({
      plan: { baseSha: approvedBaseSha },
      approval: {
        schema: "northstar/plan-approval/1",
        taskId: contract.id,
        planDigest: f.legacyPlans[0]!.planDigest,
        reviewedCommit: planHeadSha,
        baseSha: approvedBaseSha,
      },
      pr: {
        number: 15,
        headRefOid: planHeadSha,
        baseRefOid: currentBaseSha,
      },
    });
  });

  it("rejects the pin when its plan branch or base branch identity changes", () => {
    const branchChange = fixture();
    branchChange.pull.head.ref = "plan/another-task";
    expect(() => fetchApprovedPlan(contract, {
      run: branchChange.run,
      legacyPlans: branchChange.legacyPlans,
    })).toThrow(/current task and approved base/i);

    const baseChange = fixture();
    baseChange.pull.base.ref = "release";
    expect(() => fetchApprovedPlan(contract, {
      run: baseChange.run,
      legacyPlans: baseChange.legacyPlans,
    })).toThrow(/current task and approved base/i);
  });
});
