import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decide,
  extractIssue,
  isTaskInvocation,
  resolveTask,
  clearTaskState,
} from "../../scripts/resolve-task.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import {
  clearUnselectedTaskState,
  resolveIssueNumber,
} from "../../scripts/session-start.mjs";
import {
  claimWorkspaceOwner,
  readWorkspaceOwner,
  releaseTaskWorkspace,
  releaseWorkspaceClaim,
  WORKSPACE_OWNER_PATH,
} from "../../scripts/workspace-owner.mjs";

const fixtureEnv = { GITHUB_REPOSITORY: "fixture/northstar" };

describe("task-resolution hook budgets", () => {
  it("bounds live issue and approved-plan resolution without weakening fast write authorization", () => {
    const hooks = JSON.parse(readFileSync(
      join(import.meta.dirname, "..", "..", ".github", "hooks", "agent-boundary.json"),
      "utf8",
    )).hooks;
    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.SessionStart[0]).toMatchObject({
      command: "node scripts/session-start.mjs",
      timeout: 90,
    });
    expect(hooks.UserPromptSubmit).toHaveLength(1);
    expect(hooks.UserPromptSubmit[0]).toMatchObject({
      command: "node scripts/resolve-task.mjs",
      timeout: 90,
    });
    expect(hooks.PreToolUse[0]).toMatchObject({
      command: "node scripts/authorize-tool.mjs",
      timeout: 10,
    });
  });
});

describe("the issue number is an argument, not a guess", () => {
  it("recognizes the raw slash invocation", () => {
    expect(isTaskInvocation("/plan 4")).toBe(true);
    expect(isTaskInvocation("/implement 4")).toBe(true);
  });

  describe("fresh task authority", () => {
    it("clears stale authority when task resolution fails", async () => {
      const root = mkdtempSync(join(tmpdir(), "northstar-resolution-test-"));
      const files = ["task-contract.json", "task-plan.md", "plan.json", "approved-plan.json", "task-session.json", "execution-context.json"];
      const stale = () => {
        mkdirSync(join(root, "artifacts"), { recursive: true });
        for (const file of files) writeFileSync(join(root, "artifacts", file), "stale");
      };
      try {
        const owner = claimWorkspaceOwner({
          root,
          issue: 14,
          sessionId: "session-14",
          env: fixtureEnv,
        });
        releaseWorkspaceClaim(owner);
        stale();
        expect(() => resolveTask(14, {
          root, cloud: false, sessionId: "session-14", env: fixtureEnv,
          readContract: () => { throw new Error("Repository read denied."); },
        })).toThrow(/denied/);
        for (const file of files) expect(existsSync(join(root, "artifacts", file))).toBe(false);

        const fixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
        const contract = { ...fixture, source: { ...fixture.source, trusted: true, issue: 14 } };
        stale();
        expect(() => resolveTask(14, {
          root, cloud: false, sessionId: "session-14", env: fixtureEnv, readContract: () => contract,
          readApprovedPlan: () => { throw new Error("Approval lookup failed."); },
        })).toThrow(/Approval lookup/);
        for (const file of files) expect(existsSync(join(root, "artifacts", file))).toBe(false);

        resolveTask(14, {
          root, cloud: false, env: fixtureEnv, readContract: () => contract, readApprovedPlan: () => null,
          role: "plan", sessionId: "session-14",
        });
        expect(JSON.parse(readFileSync(join(root, "artifacts", "task-contract.json"), "utf8")).source.issue).toBe(14);
        expect(JSON.parse(readFileSync(join(root, "artifacts", "task-session.json"), "utf8")).sessionId).toBe("session-14");
        expect(existsSync(join(root, "artifacts", "approved-plan.json"))).toBe(false);
        await releaseTaskWorkspace({
          root, issue: 14, sessionId: "session-14", env: fixtureEnv,
        }, { clearTaskState });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("preserves unowned task artifacts until explicit orphan cleanup", async () => {
      const root = mkdtempSync(join(tmpdir(), "northstar-orphaned-task-"));
      const contractPath = join(root, "artifacts", "task-contract.json");
      try {
        mkdirSync(join(root, "artifacts"), { recursive: true });
        writeFileSync(contractPath, '{"old":"task"}');
        writeFileSync(join(root, "artifacts", "unrelated.txt"), "preserve");

        expect(() => resolveTask(14, {
          root,
          sessionId: "new-session",
          env: fixtureEnv,
          readContract: () => { throw new Error("must not fetch while orphaned state exists"); },
        })).toThrow(/Unowned task authority artifacts were preserved/);
        await expect(clearUnselectedTaskState({
          root,
          sessionId: "new-session",
          env: fixtureEnv,
        })).rejects.toThrow(/Unowned task authority artifacts were preserved/);
        expect(readFileSync(contractPath, "utf8")).toBe('{"old":"task"}');
        expect(readWorkspaceOwner(root)).toBeNull();

        await releaseTaskWorkspace(
          {
            root,
            issue: 14,
            sessionId: "new-session",
            env: fixtureEnv,
            allowUnownedState: true,
          },
          { clearTaskState },
        );
        expect(existsSync(contractPath)).toBe(false);
        expect(readFileSync(join(root, "artifacts", "unrelated.txt"), "utf8")).toBe("preserve");
        expect(readWorkspaceOwner(root)).toBeNull();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("releases only same-session task authority when no task is selected", async () => {
      const root = mkdtempSync(join(tmpdir(), "northstar-session-start-"));
      try {
        const fixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
        const contract = {
          ...fixture,
          source: {
            ...fixture.source,
            trusted: true,
            issue: 14,
            bodyDigest: "a".repeat(64),
          },
        };
        resolveTask(14, {
          root,
          cloud: false,
          role: "plan",
          sessionId: "session-14",
          env: fixtureEnv,
          readContract: () => contract,
          readApprovedPlan: () => null,
        });

        await expect(clearUnselectedTaskState({
          root,
          sessionId: "session-14",
          env: fixtureEnv,
        })).resolves.toMatchObject({ status: "released" });
        expect(readWorkspaceOwner(root)).toBeNull();
        expect(existsSync(join(root, WORKSPACE_OWNER_PATH))).toBe(false);
        expect(existsSync(join(root, "artifacts", "task-contract.json"))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("contains failure and cleanup within the owning task", async () => {
      const root = mkdtempSync(join(tmpdir(), "northstar-session-start-"));
      try {
        const fixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
        const contract = {
          ...fixture,
          source: {
            ...fixture.source,
            trusted: true,
            issue: 14,
            bodyDigest: "a".repeat(64),
          },
        };
        resolveTask(14, {
          root,
          cloud: false,
          role: "plan",
          sessionId: "owner-session",
          env: fixtureEnv,
          readContract: () => contract,
          readApprovedPlan: () => null,
        });
        const contractBefore = readFileSync(join(root, "artifacts", "task-contract.json"));

        expect(() => resolveTask(14, {
          root,
          cloud: false,
          role: "plan",
          sessionId: "other-session",
          env: fixtureEnv,
          readContract: () => { throw new Error("the conflicting session must not resolve a contract"); },
        })).toThrow(/already owned/);
        expect(readFileSync(join(root, "artifacts", "task-contract.json"))).toEqual(contractBefore);

        const result = await clearUnselectedTaskState({
          root,
          sessionId: "other-session",
          env: fixtureEnv,
        });
        expect(result.status).toBe("preserved");
        expect(result.reason).toMatch(/already owned/);
        expect(readWorkspaceOwner(root)).toMatchObject({
          issue: 14,
          taskId: contract.id,
          contractDigest: "a".repeat(64),
        });
        expect(readFileSync(join(root, "artifacts", "task-contract.json"))).toEqual(contractBefore);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("refreshes a changed contract digest for the same task owner", async () => {
      const root = mkdtempSync(join(tmpdir(), "northstar-session-start-"));
      try {
        const fixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
        const contract = (bodyDigest: string) => ({
          ...fixture,
          source: { ...fixture.source, trusted: true, issue: 14, bodyDigest },
        });
        resolveTask(14, {
          root,
          cloud: false,
          role: "plan",
          sessionId: "owner-session",
          env: fixtureEnv,
          readContract: () => contract("a".repeat(64)),
          readApprovedPlan: () => null,
        });
        resolveTask(14, {
          root,
          cloud: false,
          role: "plan",
          sessionId: "owner-session",
          env: fixtureEnv,
          readContract: () => contract("b".repeat(64)),
          readApprovedPlan: () => null,
        });

        expect(readWorkspaceOwner(root)).toMatchObject({
          issue: 14,
          taskId: fixture.id,
          contractDigest: "b".repeat(64),
        });
        expect(JSON.parse(readFileSync(
          join(root, "artifacts", "task-contract.json"),
          "utf8",
        )).source.bodyDigest).toBe("b".repeat(64));
        await releaseTaskWorkspace(
          { root, issue: 14, sessionId: "owner-session", env: fixtureEnv },
          { clearTaskState },
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("uses documented initial prompts and cloud prompt without branch inference", () => {
      expect(resolveIssueNumber({ env: {}, payload: { initial_prompt: "/plan 14" } })).toEqual({
        number: 14, how: "initial_prompt",
      });
      expect(resolveIssueNumber({ env: {}, payload: { initialPrompt: "/implement 14" } }).number).toBe(14);
      expect(resolveIssueNumber({ env: { COPILOT_AGENT_PROMPT: "Task issue: #14\nTask role: implement" } }).number).toBe(14);
      expect(() => resolveIssueNumber({
        env: { AGENT_TASK_ISSUE: "4", COPILOT_AGENT_PROMPT: "/implement 14" },
      })).toThrow(/Conflicting/);
      expect(() => resolveIssueNumber({ env: { AGENT_TASK_ISSUE: "-1" } })).toThrow(/positive/);
      expect(resolveIssueNumber({ env: { COPILOT_AGENT_PROMPT: "Explain this example:\n```\n/plan 4\n```" } }).number).toBeNull();
      expect(resolveIssueNumber({ env: { COPILOT_AGENT_PROMPT: "> /plan 4" } }).number).toBeNull();
    });
  });

  it("recognizes the expanded prompt body", () => {
    // It is not documented whether UserPromptSubmit receives the typed text or
    // the expanded prompt file. Both forms are matched so the hook behaves the
    // same either way rather than silently doing nothing in one of them.
    expect(
      isTaskInvocation("Task issue: #4\n\nThat number is the only thing..."),
    ).toBe(true);
  });

  it("ignores an ordinary chat turn", () => {
    // A workspace hook fires on every prompt. Anything else here would put a
    // GitHub round trip in front of every unrelated question.
    expect(isTaskInvocation("why does the retry policy back off?")).toBe(false);
    expect(decide("why does the retry policy back off?")).toEqual({
      action: "ignore",
    });
  });

  it("reads the number from every form a human might type", () => {
    expect(extractIssue("/plan 4")).toBe(4);
    expect(extractIssue("/implement #12")).toBe(12);
    expect(extractIssue("Task issue: #7")).toBe(7);
    expect(extractIssue("please plan issue #31 today")).toBe(31);
    expect(extractIssue("npm run contract:fetch -- --issue 9")).toBe(9);
  });

  it("stops the turn when a task agent is invoked with no number", () => {
    const decision = decide("/plan");
    expect(decision).toMatchObject({ action: "stop" });
    expect(decision.action === "stop" && decision.reason).toMatch(
      /issue as an argument/,
    );
  });

  it("stops rather than resolving an unsubstituted placeholder", () => {
    // If the input variable is not filled in, the body still looks like an
    // invocation. Guessing which issue was meant is the failure mode this whole
    // change removes.
    expect(decide("Task issue: #${input:issue}").action).toBe("stop");
  });

  it("resolves when the number is given", () => {
    expect(decide("/implement 4")).toEqual({ action: "resolve", issue: 4 });
  });
});
