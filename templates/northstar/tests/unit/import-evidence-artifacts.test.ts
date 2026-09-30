import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importEvidenceArtifacts, importWorkflowResults } from "../../scripts/import-evidence-artifacts.mjs";
import { CHECK_ARTIFACTS, SOURCE_RUN_PATH, digestPath } from "../../scripts/evidence-record.mjs";
import type { CheckRecord } from "../../scripts/evidence-record.mjs";
import { extractPlanContract, planDigest } from "../../scripts/plan-contract.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import { loadCheckRecords } from "../../scripts/build-execution-report.mjs";

const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
}, 60000);

function temp(): string {
  const path = mkdtempSync(join(tmpdir(), "northstar-evidence-"));
  temporary.push(path);
  return path;
}

describe("isolated evidence import", () => {
  it("copies allowlisted evidence and quarantines producer records", () => {
    const source = temp();
    const destination = temp();
    writeFileSync(join(source, "unit-junit.xml"), "<testsuites />");
    mkdirSync(join(source, "checks"));
    writeFileSync(join(source, "checks", "quality.json"), "{}");

    expect(importEvidenceArtifacts(source, destination)).toEqual([
      "artifacts/producer-checks/quality.json",
      "artifacts/unit-junit.xml",
    ]);
    expect(
      readFileSync(join(destination, "artifacts", "unit-junit.xml"), "utf8"),
    ).toBe("<testsuites />");
    expect(existsSync(join(destination, "artifacts", "checks", "quality.json"))).toBe(false);
  });

  it("rejects files that could overwrite trusted publisher code", () => {
    const source = temp();
    const destination = temp();
    mkdirSync(join(source, "scripts"));
    writeFileSync(join(source, "scripts", "publish-evidence.mjs"), "malicious");

    expect(() => importEvidenceArtifacts(source, destination)).toThrow(
      /unexpected paths.*scripts\/publish-evidence\.mjs/,
    );
  });

  it("ignores non-authoritative reports recomputed by trusted publication", () => {
    const source = temp();
    const destination = temp();
    writeFileSync(join(source, "quality-governance-report.json"), "{}");
    writeFileSync(join(source, "report.json"), "{}");
    writeFileSync(join(source, "unit-junit.xml"), "<testsuites />");

    expect(importEvidenceArtifacts(source, destination)).toEqual([
      "artifacts/unit-junit.xml",
    ]);
  });

  it("restores trusted maintenance evidence without allowing source files", () => {
    const source = temp();
    const destination = temp();
    mkdirSync(join(source, "artifacts", "checks"), { recursive: true });
    writeFileSync(
      join(source, "artifacts", "checks", "quality.json"),
      "{}",
    );
    writeFileSync(
      join(source, "artifacts", "approved-plan.json"),
      "{}",
    );

    expect(
      importEvidenceArtifacts(source, destination, { maintenance: true }),
    ).toEqual([
      "artifacts/approved-plan.json",
      "artifacts/checks/quality.json",
    ]);
  });

  it("does not import a producer plan or task cache as live authority", () => {
    const source = temp();
    const destination = temp();
    writeFileSync(join(source, "plan.json"), '{"producer":true}');
    writeFileSync(join(source, "task-contract.json"), '{"trusted":true}');
    writeFileSync(join(source, "approved-plan.json"), '{"approved":true}');
    expect(importEvidenceArtifacts(source, destination)).toEqual(["artifacts/producer-context/plan.json"]);
    expect(existsSync(join(destination, "artifacts", "plan.json"))).toBe(false);
    expect(existsSync(join(destination, "artifacts", "task-contract.json"))).toBe(false);
    expect(existsSync(join(destination, "artifacts", "approved-plan.json"))).toBe(false);
  });

  it("rejects duplicate logical artifacts before copying anything", () => {
    const source = temp();
    const destination = temp();
    mkdirSync(join(source, "artifacts"));
    writeFileSync(join(source, "artifacts", "unit-junit.xml"), "one");
    writeFileSync(join(source, "unit-junit.xml"), "another");
    expect(() => importEvidenceArtifacts(source, destination)).toThrow(/Duplicate evidence/);
    expect(existsSync(join(destination, "artifacts"))).toBe(false);
  });

  it("does not partially copy allowlisted files before rejecting an unexpected file", () => {
    const source = temp();
    const destination = temp();
    writeFileSync(join(source, "unit-junit.xml"), "passing");
    writeFileSync(join(source, "untrusted.mjs"), "unexpected");
    expect(() => importEvidenceArtifacts(source, destination)).toThrow(/unexpected paths/);
    expect(existsSync(join(destination, "artifacts"))).toBe(false);
  });
});

function fixture() {
  const root = temp();
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const json = (path: string, value: unknown) => write(path, JSON.stringify(value));
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "--quiet"]);
  write(".gitignore", "artifacts/\n");
  git(["add", ".gitignore"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=.git/hooks",
    "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Offline importer fixture"]);
  const repository = "fixture/northstar";
  const sourceHead = "a".repeat(40);
  const task = contractFromFile("tests/fixtures/WI-1842.issue.md");
  const contract = {
    ...task,
    source: {
      ...task.source, trusted: true, kind: "issue #17", issue: 17,
      actor: "fixture-owner", association: "OWNER", url: `https://github.com/${repository}/issues/17`,
    },
  };
  const plan = extractPlanContract(readFileSync(join(import.meta.dirname, "..", "fixtures", "WI-1842.plan.md"), "utf8"))!;
  plan.planDigest = planDigest(plan);
  json("artifacts/task-contract.json", contract);
  json("artifacts/producer-context/plan.json", plan);
  const env: Record<string, string | undefined> = {
    GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repository, PR_NUMBER: "17",
    NORTHSTAR_HEAD_SHA: sourceHead, NORTHSTAR_RUN_ID: "42", NORTHSTAR_RUN_ATTEMPT: "2",
    GITHUB_RUN_ID: "900", GITHUB_RUN_ATTEMPT: "9", GITHUB_WORKFLOW: "Publish Evidence",
    GITHUB_EVENT_NAME: "workflow_run", GITHUB_ACTOR: "fixture-publisher",
  };
  const source = {
    id: 42, name: "Governed Change", path: ".github/workflows/governed-change.yml",
    repository: { full_name: repository }, head_repository: { full_name: repository },
    event: "pull_request", status: "completed", head_sha: sourceHead, run_attempt: 2,
    actor: { login: "fixture-producer" },
    pull_requests: [{ number: 17, head: { sha: sourceHead }, base: { sha: plan.baseSha } }],
  };
  const pull = {
    number: 17,
    head: { sha: sourceHead, repo: { full_name: repository } },
    base: { sha: plan.baseSha, repo: { full_name: repository } },
  };
  const ids = ["quality", "acceptance", "dependency-review", "secret-scan", "codeql", "merge-validation", "governance-policy"];
  const producers: CheckRecord[] = ids.map((id) => {
    const artifact = CHECK_ARTIFACTS[id]?.[0] ?? null;
    if (artifact) {
      if (id === "codeql") json(`${artifact}/results.sarif`, { version: "2.1.0", runs: [{ tool: { driver: { name: "CodeQL" } }, results: [] }] });
      else if (artifact.endsWith(".xml")) write(artifact, '<testsuites><testsuite tests="1" failures="0" errors="0"><testcase name="passing"/></testsuite></testsuites>');
      else if (id === "governance-policy") json(artifact, {
        schema: "northstar/governance-report/1", sourceControlsReady: true, checks: [{ id: "fixture", ok: true }],
      });
      else if (id === "merge-validation") json(artifact, { schema: "northstar/merge-report/1", ok: true, base: plan.baseSha });
      else json(artifact, { metadata: { vulnerabilities: { high: 0, critical: 0 } } });
    }
    const record: CheckRecord = {
      schema: "northstar/check-evidence/1", id, status: "pass", required: true,
      category: "execution", summary: "Offline producer fixture.",
      artifact, artifactDigest: digestPath(artifact, root), producedAt: "2026-09-04T10:00:30Z",
      provenance: {
        repository, workflow: "Governed Change", job: id, event: source.event,
        actor: source.actor.login, runId: "42", runAttempt: "2",
        executionRunId: "42", executionRunAttempt: "2", pullRequest: 17,
        headSha: sourceHead, baseSha: plan.baseSha,
        taskId: contract.id, contractDigest: contract.source.bodyDigest, planDigest: plan.planDigest!,
        source: { headSha: sourceHead, dirty: false }, validationStartedAt: null,
      },
    };
    json(`artifacts/producer-checks/${id}.json`, record);
    return record;
  });
  const jobs = ids.map((name, index) => ({
    id: 100 + index, run_id: 42, head_sha: sourceHead, name, status: "completed",
    conclusion: "success", html_url: `https://github.com/${repository}/actions/runs/42/job/${100 + index}`,
    started_at: "2026-09-04T10:00:00Z", completed_at: "2026-09-04T10:01:00Z",
  }));
  const calls: string[][] = [];
  const run = (args: string[]) => {
    calls.push(args);
    const route = args.at(-1)!;
    if (route.endsWith("/actions/runs/42")) return JSON.stringify(source);
    if (route.endsWith("/pulls/17")) return JSON.stringify(pull);
    if (route.endsWith("/attempts/2/jobs?per_page=100")) return JSON.stringify([{ jobs: jobs.slice(0, 3) }, { jobs: jobs.slice(3) }]);
    throw new Error(`Unexpected offline GitHub route: ${route}`);
  };
  return { root, env, source, pull, jobs, producers, run, calls, write, json };
}

// Each case initializes real Git state; keep its startup budget bounded but separate from pure unit tests.
describe("producer-preserving workflow fan-in", { timeout: 60000 }, () => {
  it("retains complete producer identity instead of relabeling it with the publisher", () => {
    const f = fixture();
    const imported = importWorkflowResults("42", f.root, { env: f.env, run: f.run });
    expect(imported).toHaveLength(7);
    expect(Object.fromEntries(imported.map(({ id, provenance }) => [id, provenance])))
      .toEqual(Object.fromEntries(f.producers.map(({ id, provenance }) => [id, provenance])));
    expect(imported[0]?.importedBy).toMatchObject({
      actor: "fixture-publisher", workflow: "Publish Evidence",
      runId: "42", runAttempt: "2", executionRunId: "900", executionRunAttempt: "9",
    });
    expect(imported[0]?.workflowJob).toMatchObject({ id: 100, conclusion: "success" });
    expect(f.calls).toContainEqual(["api", "--paginate", "--slurp", "repos/fixture/northstar/actions/runs/42/attempts/2/jobs?per_page=100"]);
    expect(JSON.parse(readFileSync(join(f.root, SOURCE_RUN_PATH), "utf8"))).toMatchObject({ runId: "42", runAttempt: "2" });
    expect(SOURCE_RUN_PATH.split("/").at(-1)).toBe("source-run.json");
    expect(loadCheckRecords("artifacts/checks", f.root)).toHaveLength(7);
    expect(existsSync(join(f.root, "artifacts/plan.json"))).toBe(false);
  });

  it.each([
    ["baseSha", "c".repeat(40)], ["headSha", "d".repeat(40)],
    ["taskId", "other"], ["contractDigest", "b".repeat(64)], ["planDigest", "c".repeat(64)],
    ["runId", "41"], ["runAttempt", "1"], ["executionRunId", "900"], ["executionRunAttempt", "9"],
    ["actor", "fixture-publisher"], ["repository", "another/repository"], ["job", "acceptance"],
  ])("rejects a producer with a mismatched %s without retaining old passing records", (field, value) => {
    const f = fixture();
    importWorkflowResults("42", f.root, { env: f.env, run: f.run });
    const old = f.producers[0]!;
    f.json("artifacts/producer-checks/quality.json", { ...old, provenance: { ...old.provenance, [field]: value } });
    expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run })).toThrow(/Invalid producer evidence/);
    expect(readdirSync(join(f.root, "artifacts/checks"))).toEqual([]);
  });

  it("rejects cross-task and cross-run parallel evidence", () => {
    for (const [field, value] of [["taskId", "other-task"], ["runId", "41"]] as const) {
      const f = fixture();
      const quality = f.producers.find(({ id }) => id === "quality");
      if (!quality) throw new Error("The producer fixture is missing quality evidence.");
      f.json("artifacts/producer-checks/quality.json", {
        ...quality,
        provenance: { ...quality.provenance, [field]: value },
      });

      expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run }))
        .toThrow(/Invalid producer evidence/);
      expect(readdirSync(join(f.root, "artifacts/checks"))).toEqual([]);
    }
  });

  it("rejects missing and changed artifacts instead of rehashing them into a passing envelope", () => {
    const f = fixture();
    f.write("artifacts/unit-junit.xml", "different result");
    expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run })).toThrow(/artifact digest mismatch/);
    rmSync(join(f.root, "artifacts/unit-junit.xml"));
    expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run })).toThrow(/artifact missing/);
  });

  it("rejects missing or duplicate producer jobs and producer envelopes", () => {
    const f = fixture();
    f.jobs.push({ ...f.jobs[0]! });
    expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run })).toThrow(/duplicate.*quality/);
    f.jobs.pop();
    rmSync(join(f.root, "artifacts/producer-checks/quality.json"));
    expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run })).toThrow(/Missing.*quality/);
  });

  it("rejects stale run attempts and PR bases from live API metadata", () => {
    const f = fixture();
    f.env.NORTHSTAR_RUN_ATTEMPT = "1";
    expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run })).toThrow(/attempt/);
    f.env.NORTHSTAR_RUN_ATTEMPT = "2";
    f.pull.base.sha = "e".repeat(40);
    expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run })).toThrow(/base/);
  });

  it("rejects producer timestamps outside the exact producing job", () => {
    const f = fixture();
    f.json("artifacts/producer-checks/quality.json", { ...f.producers[0], producedAt: "2026-09-03T10:00:30Z" });
    expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run })).toThrow(/production time mismatch/);
  });

  it("never upgrades a failed producer or a failed workflow job into pass", () => {
    const f = fixture();
    f.jobs[0]!.conclusion = "failure";
    f.json("artifacts/producer-checks/acceptance.json", { ...f.producers[1], status: "fail" });
    const imported = importWorkflowResults("42", f.root, { env: f.env, run: f.run });
    expect(imported[0]?.status).toBe("fail");
    expect(imported[1]?.status).toBe("fail");
  });

  it("does not accept a workflow rerun after the triggering publication event", () => {
    const f = fixture();
    f.json("artifacts/event.json", { workflow_run: { ...f.source, run_attempt: 1 } });
    f.env.GITHUB_EVENT_PATH = join(f.root, "artifacts/event.json");
    expect(() => importWorkflowResults("42", f.root, { env: f.env, run: f.run })).toThrow(/rerun or changed/);
  });
});
