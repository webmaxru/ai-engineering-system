import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planDigest, type PlanContract } from "../../scripts/plan-contract.mjs";
import { requiredChecksForRisk } from "../../scripts/risk-policy.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import {
  parseWorktreeList,
  provisionTaskWorktree,
  validateWorktreeDestination,
  verifyTaskWorktree,
} from "../../scripts/provision-task-worktree.mjs";

const roots: string[] = [];
const baseSha = "b".repeat(40);

function temp() {
  const root = mkdtempSync(join(tmpdir(), "northstar-provision-"));
  roots.push(root);
  return root;
}

function fixture() {
  const source = contractFromFile("tests/fixtures/WI-1842.issue.md");
  const contract = {
    ...source,
    id: "AES-PARALLEL-ISOLATION",
    source: {
      ...source.source,
      issue: 16,
      kind: "issue #16",
      trusted: true,
      url: "https://github.com/webmaxru/northstar-orders-api-demo/issues/16",
    },
    inputs: {
      ...source.inputs,
      scope: { allowed: ["scripts/**", "tests/**"], prohibited: [] },
    },
  };
  const plan: PlanContract = {
    schema: "northstar/plan/1",
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    baseBranch: "agent/implement/aes-surface-evidence",
    baseSha,
    risk: "high",
    objective: contract.inputs.goal,
    scope: contract.inputs.scope,
    steps: ["Isolate."],
    requiredChecks: requiredChecksForRisk("high"),
    successCriteria: contract.successCriteria.map(({ id, statement, provenBy }) => ({
      id, statement, provenBy,
    })),
    evidence: ["Evidence."],
    decisionsAndHandoffs: ["Handoff."],
    risks: ["Risk."],
    rollbackAndEscalation: ["Rollback."],
  };
  plan.planDigest = planDigest(plan);
  const planPrHead = "c".repeat(40);
  const approved = {
    plan,
    approval: {
      source: "github-review",
      taskId: contract.id,
      contractDigest: contract.source.bodyDigest,
      planDigest: plan.planDigest,
      reviewedCommit: planPrHead,
    },
    pr: { number: 26, headRefOid: planPrHead },
  };
  return { contract, plan, approved };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("explicit task worktree provisioning", () => {
  it("rejects destinations inside or equal to the current checkout", () => {
    const root = temp();
    const repo = join(root, "repo");
    mkdirSync(repo);
    expect(() => validateWorktreeDestination(repo, repo)).toThrow(/outside/);
    expect(() => validateWorktreeDestination(repo, join(repo, "child"))).toThrow(/outside/);
    expect(validateWorktreeDestination(repo, join(root, "isolated-task"))).toBe(join(root, "isolated-task"));
  });

  it("rejects paths that escape lexical checks through a symlinked ancestor", () => {
    const root = temp();
    const repository = join(root, "repo");
    const alias = join(root, "alias");
    mkdirSync(repository);
    symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");

    expect(() => validateWorktreeDestination(
      repository,
      join(alias, "repo", "task"),
    )).toThrow(/outside the current repository/);
  });

  it("provisions only the explicitly selected task workspace", () => {
    const tempRoot = temp();
    const repositoryRoot = join(tempRoot, "repo");
    const worktreePath = join(tempRoot, "task-worktree");
    mkdirSync(repositoryRoot);
    const { contract, plan, approved } = fixture();
    const calls: string[][] = [];
    const run = (args: string[]) => {
      calls.push(args);
      if (args[0] === "worktree" && args[1] === "list") {
        return `worktree ${repositoryRoot}\nHEAD ${"a".repeat(40)}\nbranch refs/heads/main\n`;
      }
      if (args[0] === "-C" && args[2] === "branch") {
        return "agent/implement/aes-parallel-isolation";
      }
      if (args[0] === "-C" && args[2] === "rev-parse") return baseSha;
      if (args[0] === "-C" && args[2] === "merge-base") return "";
      if (args[0] === "rev-parse") return baseSha;
      if (args[0] === "worktree" && args[1] === "add") {
        const target = args[4];
        if (typeof target !== "string") throw new Error("worktree add path is missing");
        mkdirSync(dirname(target), { recursive: true });
        mkdirSync(target);
        return "";
      }
      return "";
    };
    const result = provisionTaskWorktree({
      issue: 16,
      requestedPath: worktreePath,
      sessionId: "session-16",
      repositoryRoot,
    }, {
      readContract: () => contract,
      readApprovedPlan: () => approved,
      run,
      resolveTask: (_issue, options) => {
        expect(options.root).toBe(worktreePath);
        expect(options.sessionId).toBe("session-16");
        expect(options.role).toBe("implement");
        return { approvalState: "approved" };
      },
    });

    expect(result).toEqual({
      path: worktreePath,
      branch: "agent/implement/aes-parallel-isolation",
      baseSha,
      headSha: baseSha,
      created: true,
    });
    expect(calls).toContainEqual(["fetch", "origin", plan.baseBranch]);
    expect(calls).toContainEqual([
      "worktree", "add", "-b", "agent/implement/aes-parallel-isolation", worktreePath, baseSha,
    ]);
  });

  it("parses active worktree ownership without switching another branch", () => {
    const parsed = parseWorktreeList([
      "worktree C:\\repo\\main",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree C:\\repo\\task",
      "HEAD 2222222222222222222222222222222222222222",
      "branch refs/heads/agent/implement/aes-parallel-isolation",
      "",
    ].join("\n"));
    expect(parsed).toEqual([
      { path: "C:\\repo\\main", branch: "refs/heads/main", detached: false },
      { path: "C:\\repo\\task", branch: "refs/heads/agent/implement/aes-parallel-isolation", detached: false },
    ]);
  });

  it("rejects a detached, wrong-branch, or non-descendant task checkout", () => {
    const input = {
      target: "C:\\worktrees\\task",
      branch: "agent/implement/task",
      baseSha,
    };
    expect(() => verifyTaskWorktree(input, () => "")).toThrow(/not agent\/implement\/task/);
    expect(() => verifyTaskWorktree(input, (args) =>
      args[2] === "branch" ? input.branch :
        args[2] === "rev-parse" ? "not-a-sha" : "",
    )).toThrow(/immutable commit/);
    expect(() => verifyTaskWorktree(input, (args) =>
      args[2] === "branch" ? input.branch :
        args[2] === "rev-parse" ? "c".repeat(40) :
          (() => { throw new Error("not an ancestor"); })(),
    )).toThrow(/not an ancestor/);
  });
});
