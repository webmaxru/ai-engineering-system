import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import { planDigest, renderPlanContract, type PlanContract } from "../../scripts/plan-contract.mjs";
import { requiredChecksForRisk } from "../../scripts/risk-policy.mjs";
import { fetchProposedPlan } from "../../scripts/publish-plan.mjs";
import { resolveTask, renderResult, taskInputs, taskRole } from "../../scripts/resolve-task.mjs";
import { evaluateToolCall } from "../../scripts/authorize-tool.mjs";

const roots: string[] = [];
const fixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
const contract = {
  ...fixture,
  source: { ...fixture.source, issue: 4, trusted: true },
  inputs: { ...fixture.inputs, scope: { allowed: ["src/**", "tests/**"], prohibited: [] } },
};
const plan: PlanContract = {
  schema: "northstar/plan/1", taskId: contract.id, contractDigest: contract.source.bodyDigest,
  baseBranch: "main", baseSha: "a".repeat(40), risk: "medium", objective: "A bounded feature.",
  scope: contract.inputs.scope, steps: ["Implement the bounded feature."],
  requiredChecks: requiredChecksForRisk("medium"), successCriteria: contract.successCriteria,
  evidence: ["Real tests"], decisionsAndHandoffs: ["Review before merge."],
  risks: ["Existing semantics must remain unchanged."], rollbackAndEscalation: ["Revert the change."],
};
const head = "b".repeat(40);
const repository = "example/reference";
const pull = {
  number: 19, state: "open", draft: true, html_url: `https://github.com/${repository}/pull/19`,
  user: { login: "author", type: "User" },
  head: { ref: "agent/implement/wi-1842", sha: head, repo: { full_name: repository } },
  base: { ref: "main", sha: plan.baseSha, repo: { full_name: repository } },
  body: `Closes #4\n## Plan (required)\n${renderPlanContract(plan)}`,
};
const fake = (value = pull) => (args: string[]) => {
  if (args[0] === "pr") return JSON.stringify([{ number: value.number }]);
  if (args[1] === "repos/{owner}/{repo}") return JSON.stringify({ full_name: repository });
  if (args[1]?.includes("/pulls/")) return JSON.stringify(value);
  if (args[1]?.includes("/compare/")) return JSON.stringify({ merge_base_commit: { sha: plan.baseSha }, status: "ahead" });
  throw new Error(`Unexpected fake API call: ${args.join(" ")}`);
};
const temp = () => {
  const root = mkdtempSync(join(tmpdir(), "northstar-combined-"));
  roots.push(root);
  return root;
};
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("single-PR proposed execution", () => {
  it("resolves a medium-risk plan from the implementation PR without a separate plan PR", () => {
    const result = fetchProposedPlan(contract, { run: fake(), pullRequest: 19, expectedHead: head });
    expect(result).toMatchObject({ plan, approval: null, pr: { number: 19 } });
    expect(fetchProposedPlan(contract, { run: fake(), headBranch: pull.head.ref })?.plan).toEqual(plan);
  });

  it("rejects wrong task, base, head, repository, and high-risk proposal instead of lowering the gate", () => {
    expect(() => fetchProposedPlan(contract, { run: fake({ ...pull, body: pull.body.replace("Closes #4", "Closes #5") }), pullRequest: 19 })).toThrow(/selected task/);
    expect(() => fetchProposedPlan(contract, { run: fake({ ...pull, base: { ...pull.base, sha: "c".repeat(40) } }), pullRequest: 19 })).toThrow(/base/);
    expect(() => fetchProposedPlan(contract, { run: fake(), pullRequest: 19, expectedHead: "c".repeat(40) })).toThrow(/head/);
    expect(() => fetchProposedPlan(contract, { run: fake({ ...pull, head: { ...pull.head, repo: { full_name: "outside/fork" } } }), pullRequest: 19 })).toThrow(/selected repository/);
    const high = { ...plan, risk: "high" as const, requiredChecks: requiredChecksForRisk("high") };
    expect(() => fetchProposedPlan(contract, { run: fake({ ...pull, body: `Closes #4\n## Plan (required)\n${renderPlanContract(high)}` }), pullRequest: 19 })).toThrow(/plan-first/);
  });

  it("preserves only an explicitly selected local proposal after revalidating task and isolated base", () => {
    const root = temp();
    mkdirSync(join(root, "artifacts"));
    writeFileSync(join(root, "artifacts", "plan-proposal.md"), renderPlanContract(plan));
    const result = resolveTask(4, {
      root, cloud: false, role: "implement", combined: true, sessionId: "session-17",
      env: { GITHUB_REPOSITORY: repository },
      proposalPath: "artifacts/plan-proposal.md",
      readContract: () => contract,
      readApprovedPlan: () => { throw new Error("Must not require a plan-first lookup."); },
      readWorkspace: () => ({ branch: pull.head.ref, headSha: plan.baseSha }),
    });
    expect(result.approvalState).toBe("proposed");
    const saved = JSON.parse(readFileSync(join(root, "artifacts", "plan.json"), "utf8"));
    expect(saved.planDigest).toBe(planDigest(plan));
    expect(saved.approval).toBeUndefined();
    expect(renderResult({ ...result, issue: 4 })).toContain("not human-approved");
    expect(() => readFileSync(join(root, "artifacts", "approved-plan.json"))).toThrow();
  });

  it("binds a proposed cloud plan without creating an approval record", () => {
    const root = temp();
    const result = resolveTask(4, {
      root, cloud: true, role: "implement", combined: true, pullRequest: 19,
      sessionId: "cloud-session-19",
      env: { GITHUB_REPOSITORY: repository },
      readContract: () => contract,
      readProposedPlan: () => ({
        body: renderPlanContract(plan), plan, approval: null,
        pr: { number: 19, url: pull.html_url, body: pull.body, author: { login: "author" },
          headRefOid: head, baseRefOid: plan.baseSha, isDraft: true },
      }),
      readWorkspace: () => ({ branch: "copilot/feature", headSha: head }),
      readCloudContext: (_contract, selected) => ({
        schema: "northstar/execution-context/1", host: "cloud", repository,
        pullRequest: 19, branch: "copilot/feature", headSha: head, baseSha: plan.baseSha,
        baseBranch: "main", taskId: contract.id, contractDigest: contract.source.bodyDigest,
        planDigest: planDigest(selected),
      }),
    });

    expect(result.approvalState).toBe("proposed");
    expect(JSON.parse(readFileSync(join(root, "artifacts", "execution-context.json"), "utf8")).planDigest).toBe(planDigest(plan));
    expect(() => readFileSync(join(root, "artifacts", "approved-plan.json"))).toThrow();
  });

  it("captures an explicitly selected plan before clearing old runtime authority", () => {
    const root = temp();
    mkdirSync(join(root, "artifacts"));
    writeFileSync(join(root, "artifacts", "plan.json"), JSON.stringify({ ...plan, planDigest: planDigest(plan) }));
    const result = resolveTask(4, {
      root, cloud: false, role: "implement", combined: true,
      sessionId: "session-selected-plan",
      env: { GITHUB_REPOSITORY: repository },
      proposalPath: "artifacts/plan.json",
      readContract: () => contract,
      readWorkspace: () => ({ branch: pull.head.ref, headSha: plan.baseSha }),
    });
    expect(result.approvalState).toBe("proposed");
    expect(JSON.parse(readFileSync(join(root, "artifacts", "plan.json"), "utf8")).planDigest).toBe(planDigest(plan));
  });

  it("lets a selected local combined session write only its proposal before validation", () => {
    const context = {
      taskId: contract.id, trustedContract: true, role: "implement" as const,
      scope: contract.inputs.scope, canPropose: true, sessionId: "session-17",
    };
    expect(evaluateToolCall({ toolName: "edit", toolArgs: { path: "artifacts/plan-proposal.md" } }, context).permissionDecision).toBe("allow");
    expect(evaluateToolCall({ toolName: "edit", toolArgs: { path: "src/app.ts" } }, context).permissionDecision).toBe("deny");
    expect(evaluateToolCall({ toolName: "edit", toolArgs: { path: "artifacts/approved-plan.json" } }, context).permissionDecision).toBe("deny");
    expect(evaluateToolCall({ toolName: "bash", toolArgs: { command: "npm run plan:materialize -- --file artifacts/plan-proposal.md --execute-proposed --session-id session-17" } }, context).permissionDecision).toBe("allow");
    expect(evaluateToolCall({ toolName: "bash", toolArgs: { command: "npm run plan:materialize -- --file artifacts/plan-proposal.md --execute-proposed --session-id other-session" } }, context).permissionDecision).toBe("deny");
    expect(evaluateToolCall({ toolName: "edit", toolArgs: { path: "artifacts/plan-proposal.md" } }, { ...context, role: "plan" }).permissionDecision).toBe("deny");
  });

  it("recognizes explicit combined-mode inputs without guessing a task or proposal path", () => {
    expect(taskRole("/work 4")).toBe("implement");
    expect(taskInputs("/work 4\nTask PR: #19")).toEqual({ combined: true, pullRequest: 19, proposalPath: null });
    expect(() => taskInputs("/work 4\nTask plan: ../../other/plan.md")).toThrow(/Explicit local proposals/);
    expect(() => taskInputs("/work 4\nTask PR: #19\nTask PR: #20")).toThrow(/Conflicting/);
    expect(() => taskInputs("/work 4\nTask PR: not-a-number")).toThrow(/positive/);
    expect(() => taskInputs("/work 4\nTask workflow: plan-first")).toThrow(/conflicts/);
    expect(() => taskInputs("Task issue: #4\nTask workflow: unknown")).toThrow(/must name/);
    expect(() => taskInputs("/work 4\nTask plan: ")).toThrow(/Explicit local proposals/);
  });
});
