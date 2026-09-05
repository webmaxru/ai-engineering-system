import { describe, expect, it } from "vitest";

import {
  PLAN_HEADING,
  extractPlan,
  extractPlanSection,
  implementationBranch,
  planBranch,
  publish,
  renderPlan,
  resolveBase,
} from "../../scripts/publish-plan.mjs";
import { validatePlan } from "../../scripts/check-plan.mjs";
import {
  renderPlanContract,
  type PlanContract,
} from "../../scripts/plan-contract.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";

const CONTRACT = { id: "WI-1842", source: { issue: 4 } };
const TASK_CONTRACT = contractFromFile("tests/fixtures/WI-1842.issue.md");

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
    expect(implementationBranch("WI-1842")).toBe(
      "agent/implement/wi-1842",
    );
  });

  it("edits the existing plan PR instead of opening a second one", () => {
    const calls: string[][] = [];
    const run = (args: string[]) => {
      calls.push(args);
      if (args[0] === "pr" && args[1] === "list") {
        return JSON.stringify([{ number: 11, body: "old", url: "https://example/pull/11" }]);
      }
      return "";
    };

    const result = publish(CONTRACT, GOOD_PLAN, { run, at: "now" });

    expect(result).toMatchObject({ updated: true, number: 11 });
    expect(calls.some(([a, b]) => a === "pr" && b === "create")).toBe(false);
  });

  it("opens a plan-first PR as a draft off the branch being planned against", () => {
    const vcs = (args: string[]) => {
      if (args[1] === "--abbrev-ref" && args[2] === "HEAD") {
        return "release/reference-baseline\n";
      }
      return "abc123\n";
    };
    const created: string[][] = [];
    const run = (args: string[]) => {
      created.push(args);
      if (args[0] === "pr" && args[1] === "list") return "[]";
      return "https://github.com/o/r/pull/12\n";
    };

    const result = publish(CONTRACT, GOOD_PLAN, { run, vcs, at: "now" });
    expect(result).toMatchObject({ updated: false, number: 12 });

    const create = created.find(([a, b]) => a === "pr" && b === "create")!;
    expect(create[create.indexOf("--base") + 1]).toBe(
      "release/reference-baseline",
    );
    expect(create[create.indexOf("--head") + 1]).toBe("plan/wi-1842");
  });
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
