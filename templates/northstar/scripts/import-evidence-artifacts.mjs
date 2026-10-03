import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CHECK_ARTIFACTS,
  SOURCE_RUN_PATH,
  evidenceContext,
  evidencePath,
  hasLiveTaskIdentity,
  readEvidenceJson,
  validateCheckRecord,
  writeCheckRecord,
} from "./evidence-record.mjs";
import { githubJson, runGitHub } from "./github-api.mjs";
import { planDigest, validatePlanContract } from "./plan-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const ALLOWED = new Set([
  "unit-junit.xml",
  "acceptance-junit.xml",
  "dependency-audit.json",
  "governance-report.json",
  "merge-report.json",
  "codeql",
]);
const IGNORED = [
  "task-contract.json",
  "approved-plan.json",
  "scope-report.json",
  "repository-controls-report.json",
  "validation-authority-report.json",
  "quality-governance-report.json",
  "report.json",
];
const MAINTENANCE_ALLOWED = [
  "task-contract.json",
  "candidate-plan.json",
  "approved-plan.json",
  "unit-junit.xml",
  "acceptance-junit.xml",
  "dependency-audit.json",
  "governance-report.json",
  "repository-controls-report.json",
  "merge-report.json",
  "scope-report.json",
  "validation-authority-report.json",
  "report.json",
  "maintenance-manifest.json",
  "checks/**",
  "codeql/**",
];

function normalized(path) {
  return path.replace(/\\/g, "/");
}

function allowed(path) {
  return [...ALLOWED].some(
    (entry) => path === entry || path.startsWith(`${entry}/`),
  );
}

function ignored(path) {
  return IGNORED.some((pattern) => {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    return path === pattern;
  });
}

function matchesList(path, patterns) {
  return patterns.some((pattern) => {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    return path === pattern;
  });
}

function filesUnder(root) {
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
    throw new Error("Evidence source must be a regular directory.");
  }
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Evidence artifact contains a symbolic link: ${path}`);
    }
    if (!entry.isDirectory() && !entry.isFile()) throw new Error("Evidence contains a non-regular file.");
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

export function importEvidenceArtifacts(
  source,
  destination = REPO_ROOT,
  options = {},
) {
  const sourceRoot = resolve(source);
  const pending = new Map();
  const unexpected = [];
  for (const file of filesUnder(sourceRoot)) {
    const path = normalized(relative(sourceRoot, file));
    const logicalPath = path.startsWith("artifacts/")
      ? path.slice("artifacts/".length)
      : path;
    let targetPath;
    if (options.maintenance && matchesList(logicalPath, MAINTENANCE_ALLOWED)) {
      targetPath = `artifacts/${logicalPath}`;
    } else if (logicalPath === "plan.json") {
      targetPath = "artifacts/producer-context/plan.json";
    } else if (/^checks\/[a-z][a-z0-9-]*\.json$/.test(logicalPath) &&
      Object.hasOwn(CHECK_ARTIFACTS, logicalPath.slice(7, -5))) {
      targetPath = `artifacts/producer-checks/${logicalPath.slice(7)}`;
    } else if (ignored(logicalPath)) {
      continue;
    } else if (allowed(logicalPath)) {
      targetPath = `artifacts/${logicalPath}`;
    } else {
      unexpected.push(path);
      continue;
    }
    if (pending.has(targetPath)) throw new Error(`Duplicate evidence artifact: ${targetPath}`);
    evidencePath(targetPath, destination);
    pending.set(targetPath, readFileSync(file));
  }
  if (unexpected.length > 0) {
    throw new Error(
      `Downloaded evidence contained unexpected paths: ${unexpected.join(", ")}`,
    );
  }
  for (const [path, bytes] of pending) {
    const target = evidencePath(path, destination);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  return [...pending.keys()];
}

const SOURCE_CHECKS = new Set([
  "quality", "acceptance", "dependency-review", "secret-scan",
  "codeql", "merge-validation", "governance-policy",
]);

export function importWorkflowResults(runId, destination = REPO_ROOT, options = {}) {
  const env = options.env ?? process.env;
  const runCommand = options.run ?? runGitHub;
  const repository = env.GITHUB_REPOSITORY;
  const pullRequest = Number(env.PR_NUMBER);
  if (!/^[1-9]\d*$/.test(runId) || !/^[^/\s]+\/[^/\s]+$/.test(repository ?? "") ||
    !Number.isSafeInteger(pullRequest) || pullRequest < 1 ||
    !/^[0-9a-f]{40}$/.test(env.NORTHSTAR_HEAD_SHA ?? "") ||
    (env.NORTHSTAR_RUN_ID && env.NORTHSTAR_RUN_ID !== runId)) {
    throw new Error("Import requires an exact repository, source run, pull request, and HEAD.");
  }
  const checksDirectory = evidencePath("artifacts/checks", destination);
  mkdirSync(checksDirectory, { recursive: true });
  for (const name of readdirSync(checksDirectory).filter((name) => name.endsWith(".json"))) {
    rmSync(evidencePath(`artifacts/checks/${name}`, destination));
  }
  const contract = readEvidenceJson("artifacts/task-contract.json", destination);
  const plan = readEvidenceJson("artifacts/producer-context/plan.json", destination);
  if (!hasLiveTaskIdentity(contract, repository)) {
    throw new Error("Workflow import requires the independently resolved live task contract.");
  }
  const validation = validatePlanContract(plan, contract);
  if (!validation.ok) throw new Error(`Producer plan does not match the live task: ${validation.errors.join("; ")}`);

  const api = (route) => githubJson(route, { run: runCommand });
  const run = api(`repos/${repository}/actions/runs/${runId}`);
  const pull = api(`repos/${repository}/pulls/${pullRequest}`);
  const associated = run.pull_requests?.filter(({ number }) => number === pullRequest) ?? [];
  if (String(run.id) !== runId || run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.name !== "Governed Change" || run.path !== ".github/workflows/governed-change.yml" ||
    !["pull_request", "pull_request_review"].includes(run.event) || run.status !== "completed" ||
    run.head_sha !== env.NORTHSTAR_HEAD_SHA || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
    typeof run.actor?.login !== "string" || !run.actor.login ||
    associated.length !== 1 || associated[0].head?.sha !== run.head_sha ||
    associated[0].base?.sha !== plan.baseSha ||
    pull.number !== pullRequest || pull.head?.sha !== run.head_sha || pull.base?.sha !== plan.baseSha ||
    pull.head?.repo?.full_name !== repository || pull.base?.repo?.full_name !== repository ||
    (env.BASE_SHA && env.BASE_SHA !== plan.baseSha) ||
    (env.NORTHSTAR_RUN_ATTEMPT && env.NORTHSTAR_RUN_ATTEMPT !== String(run.run_attempt))) {
    throw new Error("Workflow producer identity does not match the current task, PR, base, HEAD, or attempt.");
  }
  if (env.GITHUB_EVENT_PATH && env.GITHUB_EVENT_NAME === "workflow_run") {
    const trigger = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")).workflow_run;
    if (trigger?.id !== run.id || trigger?.run_attempt !== run.run_attempt || trigger?.head_sha !== run.head_sha) {
      throw new Error("The source workflow was rerun or changed after this publication event.");
    }
  }
  const pages = JSON.parse(runCommand([
    "api", "--paginate", "--slurp",
    `repos/${repository}/actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`,
  ]));
  if (!Array.isArray(pages) || !pages.every((page) => Array.isArray(page?.jobs))) {
    throw new Error("Workflow job pagination did not return complete job pages.");
  }
  const jobs = pages.flatMap((page) => page.jobs);
  const subjectEnv = {
    ...env, BASE_SHA: plan.baseSha, NORTHSTAR_RUN_ID: runId,
    NORTHSTAR_RUN_ATTEMPT: String(run.run_attempt),
  };
  const importedBy = evidenceContext(subjectEnv, { root: destination, contract, plan });
  const expected = {
    ...importedBy, executionRunId: runId, executionRunAttempt: String(run.run_attempt),
    workflow: run.name, event: run.event, actor: run.actor.login,
  };
  const imported = [];
  for (const id of plan.requiredChecks.filter((id) => SOURCE_CHECKS.has(id))) {
    const candidates = jobs.filter((job) => job.name === id);
    const job = candidates.length === 1 ? candidates[0] : null;
    const record = readEvidenceJson(`artifacts/producer-checks/${id}.json`, destination);
    if (!record || record.id !== id || !job || job.status !== "completed" ||
      String(job.run_id) !== runId || job.head_sha !== run.head_sha ||
      !Number.isSafeInteger(job.id) || job.id < 1 || typeof job.html_url !== "string") {
      throw new Error(`Missing, duplicate, or mismatched producer job/evidence for ${id}.`);
    }
    const checked = validateCheckRecord(record, expected, { root: destination, hosted: true });
    const produced = Date.parse(record.producedAt);
    const started = Date.parse(job.started_at);
    const completed = Date.parse(job.completed_at);
    if (!checked.valid || record.provenance.actor !== run.actor.login ||
      record.provenance.event !== run.event ||
      !Number.isFinite(started) || !Number.isFinite(completed) ||
      started > completed || produced < started || produced > completed) {
      throw new Error(`Invalid producer evidence for ${id}: ${checked.reasons.join("; ") || "actor, event, or production time mismatch"}.`);
    }
    const conclusion = job.conclusion;
    imported.push({
      ...record,
      status: conclusion === "success" ? record.status : conclusion === "skipped" ? "skipped" : "fail",
      summary: `${record.summary}\nGitHub job ${id}: ${conclusion ?? "no conclusion"}`.trim(),
      importedBy,
      workflowJob: {
        id: job.id, url: job.html_url, conclusion,
        startedAt: job.started_at, completedAt: job.completed_at,
      },
    });
  }
  const sourceRun = {
    schema: "northstar/source-run/1", repository, pullRequest,
    taskId: contract.id, contractDigest: contract.source.bodyDigest, planDigest: planDigest(plan),
    runId, runAttempt: String(run.run_attempt), headSha: run.head_sha, baseSha: plan.baseSha,
  };
  for (const record of imported) writeCheckRecord(record, undefined, destination);
  writeFileSync(evidencePath(SOURCE_RUN_PATH, destination), `${JSON.stringify(sourceRun, null, 2)}\n`);
  if (env.GITHUB_ACTIONS === "true" && env.GITHUB_ENV) {
    appendFileSync(env.GITHUB_ENV, `NORTHSTAR_RUN_ATTEMPT=${run.run_attempt}\nBASE_SHA=${plan.baseSha}\n`);
  }
  return imported;
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const source = valueOf("--from");
  if (!source) {
    process.stderr.write("Pass --from <download-directory>.\n");
    process.exit(2);
  }
  try {
    if (!existsSync(source)) throw new Error("Evidence download directory does not exist.");
    const imported = importEvidenceArtifacts(source, REPO_ROOT, {
      maintenance: process.argv.includes("--maintenance"),
    });
    process.stdout.write(
      `imported ${imported.length} allowlisted evidence file(s)\n`,
    );
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
    process.exit(1);
  }
}
