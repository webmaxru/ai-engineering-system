import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runStopGate, summarize } from "../../scripts/agent-stop.mjs";
import type { StopCommandContext } from "../../scripts/agent-stop.mjs";
import { buildExecutionReport, loadCheckRecords, readJUnit } from "../../scripts/build-execution-report.mjs";
import type { ExecutionReport } from "../../scripts/build-execution-report.mjs";
import { extractPlanContract, planDigest } from "../../scripts/plan-contract.mjs";
import type { StopAttempt } from "../../scripts/repair-budget.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import {
  bindWorkspaceOwner,
  claimWorkspaceOwner,
  releaseWorkspaceClaim,
} from "../../scripts/workspace-owner.mjs";

const passing = {
  decision: "ready_for_review",
  successCriteria: [
    { id: "AC1", proven: true },
    { id: "AC2", proven: true },
  ],
  tests: {
    unit: { tests: 86, failures: 0, errors: 0 },
    acceptance: { tests: 8, failures: 0, errors: 0 },
  },
};

describe("the stop gate summary", () => {
  it("identifies deferred criteria as unverified", () => {
    const summary = summarize({
      ...passing,
      deferredCriteria: [{ id: "AC15", status: "unverified" }],
    });

    expect(summary).toContain("deferred AC15 (unverified)");
  });

  it("reports the decision and the proven ratio", () => {
    expect(summarize(passing)).toContain("ready_for_review");
    expect(summarize(passing)).toContain("criteria 2/2");
  });

  const root = mkdtempSync(join(tmpdir(), "northstar-stop-"));
  const repository = "fixture/northstar";
  const contractFixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
  const contract = {
    ...contractFixture,
    source: {
      ...contractFixture.source, trusted: true, kind: "issue #17", issue: 17,
      actor: "fixture-owner", association: "OWNER",
      url: `https://github.com/${repository}/issues/17`,
    },
  };
  const proposal = extractPlanContract(readFileSync(join(import.meta.dirname, "..", "fixtures", "WI-1842.plan.md"), "utf8"))!;
  const digest = planDigest(proposal);
  const plan = {
    ...proposal, planDigest: digest,
    approval: {
      schema: "northstar/plan-approval/2", source: "github-review", repository,
      taskId: contract.id, contractDigest: contract.source.bodyDigest, planDigest: digest,
      planPr: 18, planUrl: `https://github.com/${repository}/pull/18`, reviewId: 123,
      reviewer: "vibeprogrammer", reviewedCommit: "c".repeat(40), baseSha: proposal.baseSha,
      approvedAt: "2026-09-01T10:00:00Z", planOnly: true,
      artifactPath: `docs/plans/${contract.id.toLowerCase()}.md`, artifactBlobSha: "d".repeat(40),
    },
  };
  const calls: string[] = [];
  const sessionTemplate = {
    issue: contract.source.issue, taskId: contract.id, contractDigest: contract.source.bodyDigest,
    role: "implement", sessionId: "fixture-implementation-session",
    workspaceOwner: "",
  };
  let session = { ...sessionTemplate };

  function write(path: string, contents: string) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }

  function writeJson(path: string, value: unknown) {
    write(path, JSON.stringify(value));
  }

  function state(): { attempts: StopAttempt[] } {
    const directory = join(root, "artifacts", "stop-recovery");
    const file = readdirSync(directory).find((path) => path.endsWith(".json"))!;
    return JSON.parse(readFileSync(join(directory, file), "utf8")) as { attempts: StopAttempt[] };
  }

  beforeAll(() => {
    const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    git(["init", "--quiet"]);
    write(".gitignore", "artifacts/\n");
    write("source.txt", "committed\n");
    git(["add", ".gitignore", "source.txt"]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=.git/hooks",
      "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Offline Stop fixture"]);
  }, 60000);

  beforeEach(() => {
    calls.length = 0;
    rmSync(join(root, "artifacts"), { recursive: true, force: true });
    write("source.txt", "committed\n");
    // Synthetic approval data is confined to this disposable test repository.
    const owner = claimWorkspaceOwner({
      root,
      issue: contract.source.issue,
      taskId: contract.id,
      contractDigest: contract.source.bodyDigest,
      sessionId: sessionTemplate.sessionId,
      env: { GITHUB_REPOSITORY: repository },
      contract,
    });
    bindWorkspaceOwner(owner, contract);
    session = { ...sessionTemplate, workspaceOwner: owner.identity.ownerKey };
    releaseWorkspaceClaim(owner);
    writeJson("artifacts/task-contract.json", contract);
    writeJson("artifacts/plan.json", plan);
    writeJson("artifacts/approved-plan.json", plan);
    writeJson("artifacts/task-session.json", session);
  }, 60000);

  afterAll(() => rmSync(root, { recursive: true, force: true }), 60000);

  function currentReport(context: StopCommandContext): ExecutionReport {
    return buildExecutionReport({
      contract, plan, records: loadCheckRecords("artifacts/checks", root),
      unit: readJUnit("artifacts/unit-junit.xml", root),
      acceptance: readJUnit("artifacts/acceptance-junit.xml", root),
      hosted: false, env: context.env, root,
    });
  }

  function simulate(command: string, context: StopCommandContext) {
    calls.push(command);
    const tests = contract.successCriteria.map(({ provenBy }) => `<testcase name="${provenBy}" />`).join("");
    const xml = `<testsuites><testsuite tests="${contract.successCriteria.length}" failures="0" errors="0" skipped="0">${tests}</testsuite></testsuites>`;
    if (command.includes("test:unit:ci")) write("artifacts/unit-junit.xml", xml);
    else if (command.includes("test:acceptance:ci")) write("artifacts/acceptance-junit.xml", xml);
    else if (command.includes("npm audit")) writeJson("artifacts/dependency-audit.json", { metadata: { vulnerabilities: { high: 0, critical: 0 } } });
    else if (command.includes("governance:check")) writeJson("artifacts/governance-report.json", {
      schema: "northstar/governance-report/1", sourceControlsReady: true, checks: [{ id: "fixture", ok: true }],
    });
    else if (command.includes("scope:check")) writeJson("artifacts/scope-report.json", {
      schema: "northstar/scope-report/1", taskId: contract.id, contractDigest: contract.source.bodyDigest,
      ok: true, paths: [], violations: [],
    });
    else if (command.includes("check-merge.mjs")) writeJson("artifacts/merge-report.json", { schema: "northstar/merge-report/1", ok: true, base: plan.baseSha });
    else if (command.startsWith("npm run evidence")) {
      const report = currentReport(context);
      writeJson(command.split("--out ")[1]!, report);
      return { ok: report.decision === "ready_for_review", output: `${report.decision}: ${report.contextErrors.join("; ")}` };
    }
    return { ok: true, output: "" };
  }

  function stop(run = simulate, active = false) {
    return runStopGate({ stop_hook_active: active, hook_event_name: "Stop", session_id: session.sessionId }, {
      root, env: { GITHUB_REPOSITORY: repository }, run,
    });
  }

  // Real Git subprocesses can approach a minute under shared Windows load.
  describe("current Stop evidence and persistent recovery", { timeout: 90000 }, () => {
    it.each(["plan", null])("does not run implementation checks or alter evidence for role %s", (role) => {
      writeJson("artifacts/task-session.json", { ...session, role });
      writeJson("artifacts/report.json", { owner: "another-role" });
      const previous = readFileSync(join(root, "artifacts/report.json"), "utf8");
      expect(stop().systemMessage).toContain("No completion was verified and no Stop attempt was spent");
      expect(calls).toEqual([]);
      expect(existsSync(join(root, "artifacts/stop-recovery"))).toBe(false);
      expect(readFileSync(join(root, "artifacts/report.json"), "utf8")).toBe(previous);
    });

    it.each([
      ["role", "unknown"], ["issue", 99], ["taskId", "OTHER-TASK"],
      ["contractDigest", "a".repeat(64)], ["sessionId", "another-session"],
      ["sessionId", null], ["sessionId", ""],
    ])("rejects mismatched task-session %s before spending an attempt", (field, value) => {
      writeJson("artifacts/task-session.json", { ...session, [field]: value });
      expect(stop()).toMatchObject({ continue: false, stopReason: expect.stringContaining("Completion was not verified") });
      expect(calls).toEqual([]);
      expect(existsSync(join(root, "artifacts/stop-recovery"))).toBe(false);
    });

    it.each(["{}", "{", "null"])("rejects malformed task-session metadata: %s", (raw) => {
      write("artifacts/task-session.json", raw);
      expect(stop().continue).toBe(false);
      expect(calls).toEqual([]);
    });

    it("fails closed after task resolution clears the session or approved-plan cache", () => {
      rmSync(join(root, "artifacts/task-session.json"));
      expect(stop().continue).toBe(false);
      writeJson("artifacts/task-session.json", session);
      rmSync(join(root, "artifacts/approved-plan.json"));
      expect(stop().stopReason).toContain("verified approved-plan cache is missing");
      expect(calls).toEqual([]);
      expect(existsSync(join(root, "artifacts/stop-recovery"))).toBe(false);
    });

    it("accepts the matching camel-case session field and records session attribution", () => {
      const result = runStopGate({ stop_hook_active: false, sessionId: session.sessionId }, {
        root, env: { GITHUB_REPOSITORY: repository }, run: simulate,
      });
      expect(result.systemMessage).toContain("Evidence gate passed");
      expect(state().attempts[0]?.sessionId).toBe(session.sessionId);
    });

    it("rejects conflicting or omitted session identity instead of choosing an alias", () => {
      for (const input of [
        { stop_hook_active: false },
        { stop_hook_active: false, session_id: session.sessionId, sessionId: "another-session" },
        { stop_hook_active: false, sessionId: 5 },
      ]) {
        expect(runStopGate(input, { root, run: simulate }).continue).toBe(false);
      }
      expect(calls).toEqual([]);
    });

    it("fails closed when the host does not provide the session identity", () => {
      writeJson("artifacts/task-session.json", { ...session, sessionId: null });
      const result = runStopGate({ stop_hook_active: false }, {
        root, env: { GITHUB_REPOSITORY: repository }, run: simulate,
      });
      expect(result.continue).toBe(false);
      expect(result.stopReason).toContain("session identity is missing");
      expect(calls).toEqual([]);
      expect(existsSync(join(root, "artifacts/stop-recovery"))).toBe(false);
    });

    it("stops when resolution clears task authority during a running validation", () => {
      const result = stop((command, context) => {
        const outcome = simulate(command, context);
        if (command.includes("test:unit:ci")) {
          for (const path of ["task-contract.json", "plan.json", "approved-plan.json", "task-session.json"]) {
            rmSync(join(root, "artifacts", path));
          }
        }
        return outcome;
      });
      expect(result.continue).toBe(false);
      expect(calls).toHaveLength(1);
      expect(state().attempts[0]?.status).toBe("failed");
      expect(existsSync(join(root, "artifacts/report.json"))).toBe(false);
    });

    it("does not publish or delete another session's report after a task switch", () => {
      const result = stop((command, context) => {
        const outcome = simulate(command, context);
        if (command.startsWith("npm run evidence")) {
          writeJson("artifacts/task-session.json", { ...session, sessionId: "next-session" });
          writeJson("artifacts/report.json", { owner: "next-session" });
        }
        return outcome;
      });
      expect(result.continue).toBe(false);
      expect(state().attempts[0]?.status).toBe("failed");
      expect(JSON.parse(readFileSync(join(root, "artifacts/report.json"), "utf8"))).toEqual({ owner: "next-session" });
    });

    it("returns explicit escalation instead of a fail-open crash when the old report cannot be removed", () => {
      mkdirSync(join(root, "artifacts", "report.json"));
      expect(stop()).toMatchObject({
        continue: false, stopReason: expect.stringContaining("old report could not be invalidated"),
      });
      expect(calls).toEqual([]);
    });

    it("accepts only the exact report produced by its successful current command", () => {
      expect(stop().systemMessage).toMatch(/Evidence gate passed.*Hosted acceptance remains separate/);
      const attempts = state().attempts;
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({ status: "passed", failures: [], checks: expect.arrayContaining(["quality", "evidence"]) });
      expect(readFileSync(join(root, attempts[0]!.reportPath!), "utf8"))
        .toBe(readFileSync(join(root, "artifacts/report.json"), "utf8"));
    });

    it("rejects stale stop reports after evidence failure", () => {
      expect(stop().systemMessage).toContain("Evidence gate passed");
      const stale = readFileSync(join(root, "artifacts/report.json"), "utf8");
      const failEvidence = (command: string, context: StopCommandContext) => {
        if (command.startsWith("npm run evidence")) {
          calls.push(command);
          write(command.split("--out ")[1]!, stale);
          write("artifacts/report.json", stale);
          return { ok: false, output: "tool evidence failed: invalid argument" };
        }
        return simulate(command, context);
      };
      const retry = stop(failEvidence);
      expect(retry.hookSpecificOutput?.decision).toBe("block");
      expect(retry.hookSpecificOutput?.reason).toMatch(/evidence command failed.*previous reports/);
      expect(retry.systemMessage).not.toContain("passed");
      expect(existsSync(join(root, "artifacts/report.json"))).toBe(false);
      expect(state().attempts).toHaveLength(2);
      expect(state().attempts[1]).toMatchObject({ status: "failed", failures: [expect.objectContaining({ check: "evidence", layer: "tool" })] });
      expect(stop(failEvidence, true)).toMatchObject({
        continue: false, stopReason: expect.stringContaining("same evidence failure signature"),
      });
      const spent = calls.length;
      expect(stop(failEvidence, true).continue).toBe(false);
      expect(calls).toHaveLength(spent);
      expect(state().attempts).toHaveLength(3);
    });

    it("rejects an old passing report even if a later evidence command exits successfully", () => {
      stop();
      const stale = readFileSync(join(root, "artifacts/report.json"), "utf8");
      const result = stop((command, context) => {
        if (!command.startsWith("npm run evidence")) return simulate(command, context);
        write(command.split("--out ")[1]!, stale);
        return { ok: true, output: "" };
      }, true);
      expect(result.hookSpecificOutput?.decision).toBe("block");
      expect(existsSync(join(root, "artifacts/report.json"))).toBe(false);
      expect(state().attempts[1]?.failures[0]?.check).toBe("evidence");
    });

    it.each(["schema", "headSha", "baseSha", "runId", "runAttempt", "taskId", "planDigest", "contractDigest", "hosted"])(
      "rejects a current-looking report with mismatched %s", (field) => {
        const result = stop((command, context) => {
          if (!command.startsWith("npm run evidence")) return simulate(command, context);
          const report = currentReport(context);
          if (field === "schema") writeJson(command.split("--out ")[1]!, { ...report, schema: "unrecognized" });
          else if (field === "hosted") writeJson(command.split("--out ")[1]!, { ...report, decision: "ready_for_acceptance", validationLevel: "hosted-integration" });
          else writeJson(command.split("--out ")[1]!, { ...report, provenance: { ...report.provenance, [field]: "mismatch" } });
          return { ok: true, output: "" };
        });
        expect(result.systemMessage).not.toContain("passed");
        expect(existsSync(join(root, "artifacts/report.json"))).toBe(false);
        expect(state().attempts[0]?.status).toBe("failed");
      },
    );

    it("fails explicitly when a successful command produces malformed report JSON", () => {
      const result = stop((command, context) => {
        if (!command.startsWith("npm run evidence")) return simulate(command, context);
        write(command.split("--out ")[1]!, "{");
        return { ok: true, output: "" };
      });
      expect(result.systemMessage).not.toContain("passed");
      expect(state().attempts[0]?.status).toBe("failed");
      expect(existsSync(join(root, "artifacts/report.json"))).toBe(false);
    });

    it("rejects a successful evidence command that produces no current report", () => {
      const result = stop((command, context) => command.startsWith("npm run evidence")
        ? { ok: true, output: "" } : simulate(command, context));
      expect(result.hookSpecificOutput?.decision).toBe("block");
      expect(state().attempts[0]?.failures[0]?.check).toBe("evidence");
      expect(existsSync(join(root, "artifacts/report.json"))).toBe(false);
    });

    it("removes previous suite artifacts before running the current producer", () => {
      write("artifacts/unit-junit.xml", "<previous-passing-evidence/>");
      const result = stop((command, context) => command.includes("test:unit:ci")
        ? { ok: true, output: "" } : simulate(command, context));
      expect(result.systemMessage).not.toContain("passed");
      expect(state().attempts[0]?.failures[0]?.check).toBe("quality");
      expect(existsSync(join(root, "artifacts/unit-junit.xml"))).toBe(false);
      expect(existsSync(join(root, "artifacts/report.json"))).toBe(false);
    });

    it.each(["{}", "[]", "null", "{"])("validates loaded plan JSON before running commands: %s", (raw) => {
      write("artifacts/plan.json", raw);
      writeJson("artifacts/report.json", passing);
      expect(stop()).toMatchObject({ continue: false, stopReason: expect.stringContaining("Completion was not verified") });
      expect(calls).toEqual([]);
      expect(existsSync(join(root, "artifacts/report.json"))).toBe(false);
    });

    it.each(["contractDigest", "baseSha", "planDigest", "requiredChecks", "approval"])("rejects an invalid approved-plan binding for %s", (field) => {
      writeJson("artifacts/plan.json", { ...plan, [field]: field === "requiredChecks" ? [] : "invalid" });
      expect(stop().continue).toBe(false);
      expect(calls).toEqual([]);
    });

    it("never treats an explicit fixture as live Stop authority", () => {
      writeJson("artifacts/task-contract.json", {
        ...contract,
        source: { ...contract.source, kind: contractFixture.source.kind, trusted: false },
      });
      expect(stop().stopReason).toContain("Fixture data is not Stop authority");
      expect(calls).toEqual([]);
    });

    it("does not count imports or ordinary unit validation as Stop attempts", () => {
      expect(existsSync(join(root, "artifacts/stop-recovery"))).toBe(false);
      expect(summarize(passing)).toContain("ready_for_review");
      expect(runStopGate({ hook_event_name: "PostToolUse" }, { root, run: simulate }).continue).toBe(false);
      expect(calls).toEqual([]);
      expect(existsSync(join(root, "artifacts/stop-recovery"))).toBe(false);
    });

    it("does not let stop_hook_active bypass either validation or the repeat limit", () => {
      const reasoning = (command: string, context: StopCommandContext) => {
        const result = simulate(command, context);
        return command.includes("test:unit:ci") ? { ok: false, output: "AssertionError: expected replay to be true" } : result;
      };
      expect(stop(reasoning, true).hookSpecificOutput?.decision).toBe("block");
      expect(stop(reasoning, true).continue).toBe(false);
      expect(state().attempts).toHaveLength(2);
    });

    it.each([
      ["security:secrets", "incomplete scanner output", "security"],
      ["scope:check", "scope mismatch", "policy"],
      ["test:unit:ci", "opaque failure", "unknown"],
    ])("immediately escalates %s failures and cannot retry them", (match, output, layer) => {
      const fail = (command: string, context: StopCommandContext) => {
        const result = simulate(command, context);
        return command.includes(match) ? { ok: false, output } : result;
      };
      expect(stop(fail).continue).toBe(false);
      expect(state().attempts[0]?.failures[0]?.layer).toBe(layer);
      const count = calls.length;
      expect(stop(fail, true).continue).toBe(false);
      expect(calls).toHaveLength(count);
    });

    it("rejects dirty source even when every simulated check command succeeds", () => {
      write("source.txt", "uncommitted source\n");
      const result = stop();
      expect(result.systemMessage).not.toContain("passed");
      expect(existsSync(join(root, "artifacts/report.json"))).toBe(false);
    });
  });

  it("counts failures and errors together", () => {
    const failing = {
      ...passing,
      decision: "review_required",
      tests: {
        unit: { tests: 86, failures: 1, errors: 2 },
        acceptance: { tests: 8, failures: 0, errors: 0 },
      },
    };

    expect(summarize(failing)).toContain("unit 86 tests, 3 failed");
  });

  it("says so when no report was produced", () => {
    expect(summarize(null)).toMatch(/no execution report/);
  });
});
