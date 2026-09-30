import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PLAN_HEADING,
  configuredPlanReviewers,
  extractPlan,
  extractPlanSection,
  implementationBranch,
  planBranch,
  publish,
  renderPlan,
  resolveBase,
  type GitOptions,
  type PlanPr,
} from "../../scripts/publish-plan.mjs";
import { validatePlan } from "../../scripts/check-plan.mjs";
import {
  renderPlanContract,
  type PlanContract,
} from "../../scripts/plan-contract.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";

const TASK_CONTRACT = contractFromFile("tests/fixtures/WI-1842.issue.md");
// Simulated authority is used only with injected Git/GitHub fakes.
const CONTRACT = {
  ...TASK_CONTRACT,
  source: { ...TASK_CONTRACT.source, issue: 4, trusted: true },
};

const MACHINE_PLAN: PlanContract = {
  schema: "northstar/plan/1",
  taskId: TASK_CONTRACT.id,
  contractDigest: TASK_CONTRACT.source.bodyDigest,
  baseBranch: "release/reference-baseline",
  baseSha: "a".repeat(40),
  risk: "high",
  objective: TASK_CONTRACT.inputs.goal,
  scope: {
    allowed: ["src/services/postgres-idempotent-order-service.ts"],
    prohibited: TASK_CONTRACT.inputs.scope.prohibited,
  },
  steps: ["Implement ADR-007."],
  successCriteria: TASK_CONTRACT.successCriteria.map(({ id, provenBy }) => ({
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
  evidence: ["JUnit, SARIF, audit, and execution report."],
  decisionsAndHandoffs: ["Planner hands the approved plan to implementer."],
  risks: ["Cross-instance concurrency."],
  rollbackAndEscalation: ["Revert or escalate."],
};

const GOOD_PLAN = [
  "## Objective",
  "- Stop duplicate orders.",
  "",
  "## Plan",
  "- Follow ADR-007.",
  "",
  "## Scope",
  "- src/services/postgres-idempotent-order-service.ts",
  "",
  "## Success criteria",
  "- SC-1 proven by tests/acceptance/idempotency.test.ts",
  "",
  "## Evidence",
  "- JUnit and SARIF artifacts.",
  "",
  "## Decisions and handoffs",
  "- Planner to implementer after approval.",
  "",
  "## Risks",
  "- Cross-instance concurrency.",
  "",
  "## Rollback and escalation",
  "- Revert the branch; the migration is additive",
  "",
  renderPlanContract(MACHINE_PLAN),
].join("\n");

function publisher(existing?: PlanPr, expectedBody = GOOD_PLAN) {
  const calls: string[][] = [];
  const commands: string[][] = [];
  const blob = "e".repeat(40);
  const vcs = (args: string[], options?: GitOptions) => {
    commands.push(args);
    if (args[0] === "hash-object") {
      expect(options?.input).toBe(`${expectedBody.trim()}\n`);
      return `${blob}\n`;
    }
    if (args[0] === "write-tree") return `${"c".repeat(40)}\n`;
    if (args[0] === "commit-tree") return `${"d".repeat(40)}\n`;
    if (args[1] === "FETCH_HEAD") return `${existing?.headRefOid}\n`;
    return `${MACHINE_PLAN.baseSha}\n`;
  };
  const run = (args: string[]) => {
    calls.push(args);
    if (args[0] === "pr" && args[1] === "list") {
      return JSON.stringify(existing ? [{ number: existing.number }] : []);
    }
    if (args[0] === "api" && args.at(-1) === `repos/{owner}/{repo}/pulls/${existing?.number}` && existing) {
      return JSON.stringify({
        number: existing.number,
        state: "open",
        draft: existing.isDraft,
        body: existing.body,
        html_url: existing.url,
        user: { login: existing.author.login },
        head: {
          sha: existing.headRefOid,
          ref: existing.headRefName ?? "plan/wi-1842",
          repo: { full_name: "o/r" },
        },
        base: {
          sha: existing.baseRefOid,
          ref: existing.baseRefName ?? MACHINE_PLAN.baseBranch,
          repo: { full_name: "o/r" },
        },
      });
    }
    if (args[0] === "pr" && args[1] === "create") return "https://github.com/o/r/pull/12\n";
    if (args[0] === "api" && args.includes("user")) {
      return JSON.stringify({ login: "webmaxru", type: "User" });
    }
    if (args.some((arg) => arg.endsWith("/permission"))) {
      return JSON.stringify({ permission: "write", user: { login: "vibeprogrammer", type: "User" } });
    }
    if (args.includes("--paginate")) {
      return JSON.stringify([[{ filename: "docs/plans/wi-1842.md", status: "added", sha: blob }]]);
    }
    if (args.some((arg) => arg.includes("/git/commits/"))) {
      return JSON.stringify({ tree: { sha: "1".repeat(40) } });
    }
    const tree = args.find((arg) => arg.includes("/git/trees/"))?.split("/").at(-1);
    if (tree) {
      const entry = tree === "1".repeat(40)
        ? { path: "docs", type: "tree", mode: "040000", sha: "2".repeat(40) }
        : tree === "2".repeat(40)
          ? { path: "plans", type: "tree", mode: "040000", sha: "3".repeat(40) }
          : { path: "wi-1842.md", type: "blob", mode: "100644", sha: blob };
      return JSON.stringify({ truncated: false, tree: [entry] });
    }
    if (args.some((arg) => arg.includes("/git/blobs/"))) {
      return JSON.stringify({ sha: blob, encoding: "base64", size: Buffer.byteLength(GOOD_PLAN), content: Buffer.from(GOOD_PLAN).toString("base64") });
    }
    if (args.includes("--method")) return "{}";
    throw new Error(`Unexpected test GitHub command: ${args.join(" ")}`);
  };
  return { run, vcs, calls, commands };
}

describe("the plan is a pull request, not a chat message", () => {
  it("puts the plan in the PR description under the heading the gate reads", () => {
    const body = renderPlan(GOOD_PLAN, { issue: 4, at: "2026-08-24T09:00:00.000Z" });
    expect(body).toContain(PLAN_HEADING);
    expect(body).toContain("Closes #4");
    expect(extractPlanSection(body)).toBe(GOOD_PLAN);
  });

  it("records evidence expectations without claiming execution evidence", () => {
    const body = renderPlan(GOOD_PLAN);
    expect(body).toContain("## Evidence");
    expect(body).toContain("JUnit and SARIF artifacts");
    expect(body).not.toContain("Evidence: PASS");
  });

  it("names the plan branch after the task, not the session", () => {
    expect(planBranch("WI-1842")).toBe("plan/wi-1842");
    expect(planBranch("WI-1842", true)).toBe("plan/wi-1842-canary");
    expect(implementationBranch("WI-1842")).toBe(
      "agent/implement/wi-1842",
    );
  });

  it("publishes an AC15 canary plan to a separate versioned plan branch", () => {
    const canary: PlanContract = {
      ...MACHINE_PLAN,
      requiredChecks: [...MACHINE_PLAN.requiredChecks, "browser-plan-canary"],
      canaryFor: {
        sourceTaskId: TASK_CONTRACT.id,
        sourceContractDigest: TASK_CONTRACT.source.bodyDigest,
        sourcePlanDigest: "a".repeat(64),
        sourceBaseSha: "b".repeat(40),
        sourcePullRequest: 18,
        sourceHeadSha: "c".repeat(40),
        sourceRunId: "9001",
        sourceRunAttempt: "2",
        sourceEvidenceRunId: "9002",
        bootstrapPlanPr: 15,
        bootstrapPlanHeadSha: "d".repeat(40),
        bootstrapReviewId: 100,
        bootstrapReviewer: "vibeprogrammer",
      },
    };
    const body = renderPlanContract(canary);
    const deps = publisher(undefined, body);

    publish(CONTRACT, body, deps);

    const create = deps.calls.find(([a, b]) => a === "pr" && b === "create")!;
    expect(create[create.indexOf("--head") + 1]).toBe("plan/wi-1842-canary");
    expect(deps.commands.some((args) =>
      args[0] === "push" && args.at(-1) === `${"d".repeat(40)}:refs/heads/plan/wi-1842-canary`,
    )).toBe(true);
  });

  it("edits the existing plan PR instead of opening a second one", () => {
    const deps = publisher({
      number: 11, body: renderPlan(GOOD_PLAN), url: "https://example/pull/11",
      author: { login: "webmaxru" }, headRefOid: "b".repeat(40),
      baseRefOid: MACHINE_PLAN.baseSha, isDraft: false,
    });
    const result = publish(CONTRACT, GOOD_PLAN, { ...deps, at: "now" });

    expect(result).toMatchObject({ updated: true, number: 11 });
    expect(deps.calls.some(([a, b]) => a === "pr" && b === "create")).toBe(false);
    expect(deps.calls.some((args) => args.includes("PATCH"))).toBe(true);
  });

  it("opens a reviewable plan-first PR against the exact declared base", () => {
    const deps = publisher();
    const result = publish(CONTRACT, GOOD_PLAN, { ...deps, at: "now" });
    expect(result).toMatchObject({ updated: false, number: 12 });

    const create = deps.calls.find(([a, b]) => a === "pr" && b === "create")!;
    expect(create[create.indexOf("--base") + 1]).toBe(
      "release/reference-baseline",
    );
    expect(create[create.indexOf("--head") + 1]).toBe("plan/wi-1842");
    expect(create).not.toContain("--draft");
  });

  it("publishes the task-bound versioned plan artifact instead of an empty commit", () => {
    const deps = publisher();
    publish(CONTRACT, GOOD_PLAN, deps);

    expect(deps.commands.some(([command]) => command === "hash-object")).toBe(true);
    expect(deps.commands.some((args) =>
      args[0] === "update-index" && args.some((value) =>
        value.includes("docs/plans/wi-1842.md"),
      ),
    )).toBe(true);
  });

  it("requests the configured eligible plan reviewer", () => {
    const deps = publisher();
    publish(CONTRACT, GOOD_PLAN, deps);
    expect(deps.calls).toContainEqual([
      "api", "--method", "POST", "repos/{owner}/{repo}/pulls/12/requested_reviewers",
      "-f", "reviewers[]=vibeprogrammer",
    ]);
  });

  it("rejects fixture authority and ineligible reviewer routing before any Git mutation", () => {
    const deps = publisher();
    expect(() => publish(TASK_CONTRACT, GOOD_PLAN, deps)).toThrow(/trusted live/);
    expect(deps.commands).toEqual([]);
    expect(() => configuredPlanReviewers("author", {
      reviewers: ["author"], run: deps.run,
    })).toThrow(/independent/);
    expect(() => configuredPlanReviewers("author", {
      reviewers: ["reader"],
      run: () => JSON.stringify({ permission: "read", user: { login: "reader", type: "User" } }),
    })).toThrow(/eligible human/);
  });

  it("creates a real plan-only Git diff without including or changing the publisher's work", () => {
    const directory = mkdtempSync(join(tmpdir(), "northstar-plan-publication-test-"));
    const checkout = join(directory, "checkout");
    const remote = join(directory, "remote.git");
    mkdirSync(checkout);
    const vcs = (args: string[], options?: GitOptions) => execFileSync("git", args, {
      cwd: checkout, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
      input: options?.input,
      env: {
        ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined,
        GIT_INDEX_FILE: undefined, ...options?.env,
      },
    });
    try {
      vcs(["init", "--quiet", "--initial-branch=main"]);
      vcs(["config", "user.name", "Northstar Test"]);
      vcs(["config", "user.email", "test@example.invalid"]);
      vcs(["init", "--bare", "--quiet", remote]);
      writeFileSync(join(checkout, "README.md"), "Fictional baseline.\n");
      vcs(["add", "README.md"]);
      vcs(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "test base"]);
      vcs(["remote", "add", "origin", remote]);
      vcs(["push", "--quiet", "origin", "main"]);
      const base = vcs(["rev-parse", "HEAD"]).trim();
      writeFileSync(join(checkout, "README.md"), "Staged user work.\n");
      vcs(["add", "README.md"]);
      writeFileSync(join(checkout, "README.md"), "Unstaged user work.\n");
      writeFileSync(join(checkout, "untracked.txt"), "Do not publish.\n");
      const before = vcs(["status", "--porcelain"]);
      const body = renderPlanContract({ ...MACHINE_PLAN, baseBranch: "main", baseSha: base });

      publish(CONTRACT, body, { run: publisher().run, vcs });

      const head = vcs(["rev-parse", "refs/remotes/origin/plan/wi-1842"]).trim();
      expect(vcs(["diff", "--name-only", base, head]).trim()).toBe("docs/plans/wi-1842.md");
      expect(vcs(["show", `${head}:docs/plans/wi-1842.md`])).toBe(`${body}\n`);
      expect(vcs(["status", "--porcelain"])).toBe(before);
      expect(vcs(["show", `${head}:README.md`])).toBe("Fictional baseline.\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("the plan branch is cut from the branch you are on", () => {
  // Cutting it from origin/HEAD put the plan branch on a baseline with no
  // agents, prompts or hooks, so /implement could not run there at all.
  it("uses the current branch", () => {
    const vcs = (args: string[]) =>
      args[2] === "HEAD" ? "release/reference-baseline\n" : "main\n";
    expect(resolveBase(vcs)).toBe("release/reference-baseline");
  });

  it("falls back to the default branch when HEAD is detached", () => {
    const vcs = (args: string[]) => (args[2] === "HEAD" ? "HEAD\n" : "origin/main\n");
    expect(resolveBase(vcs)).toBe("main");
  });

  it("honours an explicit override", () => {
    const vcs = () => {
      throw new Error("git should not be consulted when --base is given");
    };
    expect(resolveBase(vcs, "origin/release/reference-baseline")).toBe(
      "release/reference-baseline",
    );
  });
});

describe("the plan gate reads the description, not the repository", () => {
  it("passes a plan that states scope, success criteria and rollback", () => {
    expect(validatePlan(renderPlan(GOOD_PLAN), TASK_CONTRACT)).toMatchObject({
      ok: true,
    });
  });

  it("accepts complete canonical plan fields without requiring cosmetic prose headings", () => {
    expect(validatePlan(renderPlan(renderPlanContract(MACHINE_PLAN)), TASK_CONTRACT).ok).toBe(true);
  });

  it("fails a PR whose description has no plan section", () => {
    expect(validatePlan("Some changes.", TASK_CONTRACT).ok).toBe(false);
  });

  it("fails an unfilled template", () => {
    // Learn's own snippet checks that pull_request_template.md exists in the
    // repository. That would pass here, on a PR with an empty plan - it proves
    // the template exists, not that this pull request used it.
    const empty = `${PLAN_HEADING}\n\n- **Goal:** TBD\n\n## Evidence\n`;
    expect(validatePlan(empty, TASK_CONTRACT).ok).toBe(false);
  });

  it("says which part of a reviewable plan is missing", () => {
    const noRollback = `${PLAN_HEADING}\n\nScope: src/**\nSuccess criteria: SC-1\n\n## Evidence\n`;
    const result = validatePlan(noRollback, TASK_CONTRACT);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/rollback or escalation/);
  });
});

describe("the plan survives the transcript being unreadable", () => {
  it("returns null rather than persisting a guess", () => {
    expect(extractPlan("not json at all")).toBeNull();
    expect(extractPlan("")).toBeNull();
  });

  it("reads the last assistant message from a JSONL transcript", () => {
    const transcript = [
      JSON.stringify({ role: "user", content: "plan it" }),
      JSON.stringify({ role: "assistant", content: "first pass" }),
      JSON.stringify({ role: "assistant", content: GOOD_PLAN }),
    ].join("\n");
    expect(extractPlan(transcript)).toBe(GOOD_PLAN);
  });
});
