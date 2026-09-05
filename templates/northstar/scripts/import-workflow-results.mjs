import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  createCheckRecord,
  writeCheckRecord,
} from "./evidence-record.mjs";

const ARTIFACTS = {
  "plan-contract": "artifacts/plan.json",
  "plan-approval": "artifacts/plan.json",
  "scope-policy": "artifacts/scope-report.json",
  quality: "artifacts/unit-junit.xml",
  acceptance: "artifacts/acceptance-junit.xml",
  "dependency-review": "artifacts/dependency-audit.json",
  "secret-scan": null,
  codeql: "artifacts/codeql",
  "merge-validation": "artifacts/merge-report.json",
  "governance-policy": "artifacts/governance-report.json",
  "repository-controls": "artifacts/repository-controls-report.json",
  "validation-authority": "artifacts/validation-authority-report.json",
  "human-review": null,
};
const REPO_ROOT = resolve(import.meta.dirname, "..");

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const runId = valueOf("--run");
if (!runId) {
  process.stderr.write("Pass --run <workflow-run-id>.\n");
  process.exit(2);
}

try {
  const checksDirectory = resolve(REPO_ROOT, "artifacts/checks");
  rmSync(checksDirectory, { recursive: true, force: true });
  mkdirSync(checksDirectory, { recursive: true });
  const run = JSON.parse(
    execFileSync(
      "gh",
      [
        "run",
        "view",
        runId,
        "--json",
        "databaseId,event,headSha,jobs,name,url",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  const env = {
    ...process.env,
    NORTHSTAR_RUN_ID: String(run.databaseId),
    NORTHSTAR_HEAD_SHA: run.headSha,
    GITHUB_WORKFLOW: run.name,
    GITHUB_EVENT_NAME: run.event,
    GITHUB_ACTOR: process.env.GITHUB_ACTOR ?? "github-actions[bot]",
  };

  for (const [id, artifact] of Object.entries(ARTIFACTS)) {
    const job = run.jobs.find(({ name }) => name === id);
    const status =
      job?.conclusion === "success"
        ? "pass"
        : job?.conclusion === "skipped"
          ? "skipped"
          : job
            ? "fail"
            : "not-run";
    writeCheckRecord(
      createCheckRecord(
        {
          id,
          category:
            ["dependency-review", "secret-scan", "codeql"].includes(id)
              ? "security"
              : ["plan-contract", "plan-approval", "scope-policy", "merge-validation", "governance-policy", "repository-controls", "validation-authority", "human-review"].includes(id)
                ? "policy"
                : "execution",
          status,
          artifact: artifact ?? undefined,
          summary: job ? `${job.name}: ${job.conclusion}` : "job missing",
        },
        {
          ...env,
          GITHUB_JOB: id,
        },
      ),
    );
  }
  process.stdout.write(
    `imported ${Object.keys(ARTIFACTS).length} trusted job conclusions from run ${runId}\n`,
  );
} catch (error) {
  process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
  process.exit(1);
}
