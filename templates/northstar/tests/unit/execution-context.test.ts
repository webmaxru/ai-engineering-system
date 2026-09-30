import { describe, expect, it } from "vitest";
import { resolveCloudExecution, validateCloudExecution } from "../../scripts/execution-context.mjs";
import { planDigest, renderPlanContract, type PlanContract } from "../../scripts/plan-contract.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";

describe("cloud execution isolation", () => {
  it("validates cloud execution against approved pull request identity", () => {
    const fixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
    const contract = { ...fixture, source: { ...fixture.source, issue: 4, trusted: true } };
    const plan: PlanContract = {
      schema: "northstar/plan/1", taskId: contract.id, contractDigest: contract.source.bodyDigest,
      baseBranch: "main", baseSha: "a".repeat(40), risk: "high",
      objective: "Prove isolation", scope: { allowed: ["src/**"], prohibited: [] },
      steps: ["Implement"], successCriteria: contract.successCriteria,
      requiredChecks: ["quality"], evidence: ["tests"], decisionsAndHandoffs: ["handoff"],
      risks: ["scope"], rollbackAndEscalation: ["stop"],
    };
    const repository = "example/reference";
    const branch = "copilot/wi-1842-implementation";
    const headSha = "b".repeat(40);
    const pull = {
      number: 17, state: "open", body: `Closes #4\n${renderPlanContract(plan)}`,
      user: { type: "Bot" },
      head: { ref: branch, sha: headSha, repo: { full_name: repository } },
      base: { ref: "main", sha: plan.baseSha, repo: { full_name: repository } },
    };
    const input = { pull, repository, contract, plan, branch, headSha, descendsFromApprovedBase: true };
    expect(validateCloudExecution(input)).toBe(true);
    expect(validateCloudExecution({ ...input, branch: "copilot/unrelated" })).toBe(false);
    expect(validateCloudExecution({ ...input, headSha: "c".repeat(40) })).toBe(false);
    expect(validateCloudExecution({ ...input, descendsFromApprovedBase: false })).toBe(false);
    expect(validateCloudExecution({ ...input, pull: { ...pull, body: `Closes #99\n${renderPlanContract(plan)}` } })).toBe(false);
    expect(validateCloudExecution({ ...input, pull: { ...pull, head: { ...pull.head, repo: { full_name: "outside/fork" } } } })).toBe(false);
    expect(validateCloudExecution({ ...input, pull: { ...pull, user: { type: "User" } } })).toBe(false);
    expect(plan.planDigest).toBeUndefined();
    const context = resolveCloudExecution(contract, plan, {
      vcs: (args) => args[0] === "branch" ? branch : headSha,
      run: (args) => {
        if (args[0] === "pr") return JSON.stringify([{ number: pull.number }]);
        if (args[1] === "repos/{owner}/{repo}") return JSON.stringify({ full_name: repository });
        if (args[1]?.includes("/pulls/")) return JSON.stringify(pull);
        if (args[1]?.includes("/compare/")) return JSON.stringify({ merge_base_commit: { sha: plan.baseSha }, status: "ahead" });
        throw new Error("Unexpected mocked GitHub command.");
      },
    });
    expect(context.planDigest).toBe(planDigest(plan));
  });
});
