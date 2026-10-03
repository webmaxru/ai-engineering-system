import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
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
const planBlobSha = "9".repeat(40);
const planHeadSha = "c".repeat(40);
const planBaseSha = "b".repeat(40);

function fixture() {
  const plan: PlanContract = {
    schema: "northstar/plan/1",
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    baseBranch: "main",
    baseSha: planBaseSha,
    risk: "high",
    objective: contract.inputs.goal,
    scope: { allowed: [contract.inputs.scope.allowed[0]!], prohibited: [] },
    steps: ["Verify the reviewed versioned canary plan."],
    successCriteria: contract.successCriteria.map(({ id, provenBy }) => ({ id, provenBy })),
    requiredChecks: [...new Set([...requiredChecksForRisk("high"), "browser-plan-canary"])],
    evidence: ["Immutable plan blob and exact human review."],
    decisionsAndHandoffs: ["Continue only after current human approval."],
    risks: ["An unrelated plan PR must not satisfy this approval."],
    rollbackAndEscalation: ["Stop when plan identity or review is stale."],
    canaryFor: {
      sourceTaskId: contract.id,
      sourceContractDigest: contract.source.bodyDigest,
      sourcePlanDigest: "a".repeat(64),
      sourceBaseSha: planBaseSha,
      sourcePullRequest: 18,
      sourceHeadSha: "d".repeat(40),
      sourceRunId: "9001",
      sourceRunAttempt: "2",
      sourceEvidenceRunId: "9002",
      bootstrapPlanPr: 15,
      bootstrapPlanHeadSha: "e".repeat(40),
      bootstrapReviewId: 101,
      bootstrapReviewer: "vibeprogrammer",
    },
  };
  plan.planDigest = planDigest(plan);
  const planBody = renderPlanContract(plan);
  const headBranch = `plan/${contract.id.toLowerCase()}-canary`;
  const pull = {
    number: 26,
    state: "open",
    draft: false,
    body: renderPlan(planBody, { issue: 4 }),
    html_url: `https://github.com/${repository}/pull/26`,
    user: { login: "webmaxru", type: "User" },
    head: { sha: planHeadSha, ref: headBranch, repo: { full_name: repository } },
    base: { sha: planBaseSha, ref: "main", repo: { full_name: repository } },
  };
  const review = {
    id: 202,
    state: "APPROVED",
    submitted_at: "2026-09-03T10:00:00Z",
    commit_id: planHeadSha,
    user: { login: "vibeprogrammer", type: "User" },
  };
  const file = {
    filename: `docs/plans/${contract.id.toLowerCase()}.md`,
    status: "added",
    sha: planBlobSha,
  };
  const run = (args: string[]) => {
    if (args[0] !== "api") throw new Error(`Unexpected GitHub command: ${args.join(" ")}`);
    const route = args.at(-1)!;
    if (args.includes("--paginate")) {
      if (route.includes("/reviews?")) return JSON.stringify([[review]]);
      if (route.includes("/files?")) return JSON.stringify([[file]]);
    }
    if (route === `repos/{owner}/{repo}/pulls/26`) return JSON.stringify(pull);
    if (route === "repos/{owner}/{repo}") return JSON.stringify({ full_name: repository });
    if (route.includes("/collaborators/vibeprogrammer/permission")) {
      return JSON.stringify({
        permission: "write",
        user: { login: "vibeprogrammer", type: "User" },
      });
    }
    if (route === `repos/{owner}/{repo}/git/commits/${planHeadSha}`) {
      return JSON.stringify({ tree: { sha: "1".repeat(40) } });
    }
    if (route === `repos/{owner}/{repo}/git/trees/${"1".repeat(40)}`) {
      return JSON.stringify({
        truncated: false,
        tree: [{ path: "docs", type: "tree", mode: "040000", sha: "2".repeat(40) }],
      });
    }
    if (route === `repos/{owner}/{repo}/git/trees/${"2".repeat(40)}`) {
      return JSON.stringify({
        truncated: false,
        tree: [{ path: "plans", type: "tree", mode: "040000", sha: "3".repeat(40) }],
      });
    }
    if (route === `repos/{owner}/{repo}/git/trees/${"3".repeat(40)}`) {
      return JSON.stringify({
        truncated: false,
        tree: [{
          path: `${contract.id.toLowerCase()}.md`,
          type: "blob",
          mode: "100644",
          sha: planBlobSha,
        }],
      });
    }
    if (route === `repos/{owner}/{repo}/git/blobs/${planBlobSha}`) {
      return JSON.stringify({
        sha: planBlobSha,
        encoding: "base64",
        size: Buffer.byteLength(planBody),
        content: Buffer.from(planBody, "utf8").toString("base64"),
      });
    }
    throw new Error(`Unexpected GitHub API route: ${route}`);
  };
  return { run, pull, plan };
}

describe("explicit file-backed canary plan approval", () => {
  it("resolves the native review only from the exact canary PR and immutable plan blob", () => {
    const f = fixture();
    const selection = fetchApprovedPlan(contract, {
      run: f.run,
      planPrNumber: 26,
    });

    expect(selection).toMatchObject({
      plan: { canaryFor: f.plan.canaryFor },
      approval: {
        schema: "northstar/plan-approval/2",
        source: "github-review",
        planPr: 26,
        reviewer: "vibeprogrammer",
        reviewedCommit: planHeadSha,
        artifactPath: `docs/plans/${contract.id.toLowerCase()}.md`,
        artifactBlobSha: planBlobSha,
      },
      pr: {
        number: 26,
        headRefOid: planHeadSha,
        baseRefOid: planBaseSha,
      },
    });
  });

  it("rejects an explicitly named PR on the bootstrap plan branch", () => {
    const f = fixture();
    f.pull.head.ref = `plan/${contract.id.toLowerCase()}`;
    expect(() => fetchApprovedPlan(contract, {
      run: f.run,
      planPrNumber: 26,
    })).toThrow(/not the current file-backed canary/);
  });
});
