import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function api(path) {
  return JSON.parse(
    execFileSync("gh", ["api", path], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

export function validateMaintenanceRuns({
  manifest,
  evidenceRun,
  sourceRun,
  repository,
  pullRequest,
  headSha,
}) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  check(
    manifest?.schema === "northstar/system-maintenance-manifest/1",
    "invalid maintenance manifest schema",
  );
  check(manifest.repository === repository, "manifest repository mismatch");
  check(
    Number(manifest.pullRequest) === Number(pullRequest),
    "manifest pull request mismatch",
  );
  check(manifest.headSha === headSha, "manifest head SHA mismatch");
  check(
    Number(manifest.evidenceRunId) === Number(evidenceRun.id),
    "manifest evidence run mismatch",
  );
  check(
    Number(manifest.sourceRunId) === Number(sourceRun.id),
    "manifest source run mismatch",
  );

  check(
    evidenceRun.repository?.full_name === repository,
    "evidence run repository mismatch",
  );
  check(
    evidenceRun.path === manifest.evidenceWorkflow &&
      evidenceRun.event === "workflow_run" &&
      evidenceRun.status === "completed" &&
      evidenceRun.conclusion === "success",
    "evidence run is not a successful trusted Publish Evidence run",
  );
  check(
    sourceRun.repository?.full_name === repository,
    "source run repository mismatch",
  );
  check(
    sourceRun.path === manifest.sourceWorkflow &&
      ["pull_request", "pull_request_review"].includes(sourceRun.event) &&
      sourceRun.status === "completed" &&
      sourceRun.head_sha === headSha,
    "source run is not the completed Governed Change run for the requested SHA",
  );
  check(
    (sourceRun.pull_requests ?? []).some(
      ({ number }) => Number(number) === Number(pullRequest),
    ),
    "source run is not linked to the requested pull request",
  );
  check(
    Number(evidenceRun.id) !== Number(sourceRun.id),
    "evidence and source run IDs must differ",
  );
  return { ok: errors.length === 0, errors };
}

async function completedRun(repository, runId, attempts = 24) {
  let run;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    run = api(`repos/${repository}/actions/runs/${runId}`);
    if (run.status === "completed") return run;
    await delay(5000);
  }
  return run;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const pullRequest = process.env.PR_NUMBER;
  const headSha = process.env.NORTHSTAR_HEAD_SHA;
  const evidenceRunId = process.env.EVIDENCE_RUN_ID;
  const sourceRunId = process.env.NORTHSTAR_RUN_ID;
  if (
    !repository ||
    !pullRequest ||
    !headSha ||
    !evidenceRunId ||
    !sourceRunId
  ) {
    process.stderr.write(
      "GITHUB_REPOSITORY, PR_NUMBER, NORTHSTAR_HEAD_SHA, EVIDENCE_RUN_ID, and NORTHSTAR_RUN_ID are required.\n",
    );
    process.exit(2);
  }
  try {
  const manifest = JSON.parse(
    readFileSync(
      resolve(REPO_ROOT, "artifacts/maintenance-manifest.json"),
      "utf8",
    ),
  );
  const [evidenceRun, sourceRun] = await Promise.all([
    completedRun(repository, evidenceRunId),
    completedRun(repository, sourceRunId),
  ]);
  const result = validateMaintenanceRuns({
    manifest,
    evidenceRun,
    sourceRun,
    repository,
    pullRequest,
    headSha,
  });
  if (!result.ok) {
    throw new Error(result.errors.join("; "));
  }
  process.stdout.write(
    `verified evidence_run=${evidenceRunId} source_run=${sourceRunId} pr=${pullRequest} sha=${headSha}\n`,
  );
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
