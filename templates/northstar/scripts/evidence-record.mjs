import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extractPlanContract, planDigest } from "./plan-contract.mjs";
import { workspacePath } from "./workspace-path.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const LOCAL_RUN_ID = `local-${randomUUID()}`;
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
export const CHECK_SCHEMA = "northstar/check-evidence/1";
export const CHECK_STATUSES = Object.freeze([
  "pass",
  "fail",
  "skipped",
  "not-run",
]);
export const SOURCE_RUN_PATH = "artifacts/checks/source-run.json";
export const CHECK_ARTIFACTS = Object.freeze({
  "plan-contract": ["artifacts/plan.json", "artifacts/candidate-plan.json"],
  "plan-approval": ["artifacts/plan.json", "artifacts/approved-plan.json"],
  "scope-policy": ["artifacts/scope-report.json"],
  quality: ["artifacts/unit-junit.xml"],
  acceptance: ["artifacts/acceptance-junit.xml"],
  "dependency-review": ["artifacts/dependency-audit.json"],
  "secret-scan": [],
  codeql: ["artifacts/codeql"],
  "merge-validation": ["artifacts/merge-report.json"],
  "governance-policy": ["artifacts/governance-report.json"],
  "repository-controls": ["artifacts/repository-controls-report.json"],
  "validation-authority": ["artifacts/validation-authority-report.json"],
  "browser-plan-canary": ["artifacts/browser-plan-canary.json"],
  "human-review": [],
  "production-environment": [],
});
const REVALIDATED_CHECKS = new Set([
  "plan-contract", "plan-approval", "scope-policy", "repository-controls",
  "validation-authority", "human-review", "production-environment",
  "browser-plan-canary",
]);
const CANDIDATE_POLICY_CHECKS = new Set(["plan-contract", "scope-policy"]);

export function evidencePath(path, root = REPO_ROOT) {
  return workspacePath(path, root);
}

export function readEvidenceJson(path, root = REPO_ROOT) {
  let raw;
  try {
    raw = readFileSync(evidencePath(path, root), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Cannot read evidence ${path}: ${error.message}`, { cause: error });
  }
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("expected a JSON object");
    }
    return data;
  } catch (error) {
    throw new Error(`Malformed evidence ${path}: ${error.message}`, { cause: error });
  }
}

function filesUnder(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error("Evidence contains a symbolic link.");
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) throw new Error("Evidence is not a regular file or directory.");
  return readdirSync(path)
    .sort()
    .flatMap((entry) => filesUnder(join(path, entry)));
}

export function digestPath(relativePath, root = REPO_ROOT) {
  if (!relativePath) return null;
  const absolute = evidencePath(relativePath, root);
  const files = filesUnder(absolute);
  if (files.length === 0) return null;
  const hash = createHash("sha256");
  for (const file of files) {
    const bytes = readFileSync(file);
    if (file !== absolute) {
      hash.update(`${relative(absolute, file).replace(/\\/g, "/")}\0${bytes.length}\0`);
    }
    hash.update(bytes);
  }
  return hash.digest("hex");
}

export function readSourceState(root = REPO_ROOT) {
  const git = (args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const headSha = git(["rev-parse", "HEAD"]).trim();
  if (!SHA.test(headSha)) throw new Error("Source HEAD is not an immutable commit.");
  const generatedDownloads = new Set([
    ...Object.values(CHECK_ARTIFACTS).flat().filter((path) => path !== "artifacts/codeql").map((path) => path.slice(10)),
    "task-contract.json", "approved-plan.json", "candidate-plan.json",
    "quality-governance-report.json", "report.json", "maintenance-manifest.json", "checks/source-run.json",
    ...Object.keys(CHECK_ARTIFACTS).map((id) => `checks/${id}.json`),
  ]);
  const changes = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0").filter(Boolean);
  const dirty = changes.some((entry) => {
    if (!entry.startsWith("?? ")) return true;
    const download = /^incoming-(?:maintenance-)?evidence\/(?:artifacts\/)?(.+)$/.exec(entry.slice(3).replace(/\\/g, "/"));
    // These are data-only workflow downloads; tracked files and other untracked source still count.
    return !download || (!generatedDownloads.has(download[1]) && !/^codeql\/.+\.sarif$/.test(download[1]));
  });
  return {
    headSha,
    dirty,
  };
}

export function hasLiveTaskIdentity(contract, repository) {
  const source = contract?.source;
  return contract?.schema === "northstar/task-contract/3" &&
    source?.trusted === true && Number.isSafeInteger(source.issue) && source.issue > 0 &&
    source.kind === `issue #${source.issue}` &&
    typeof source.actor === "string" && Boolean(source.actor) &&
    ["OWNER", "MEMBER", "COLLABORATOR"].includes(source.association) &&
    source.url === `https://github.com/${repository}/issues/${source.issue}` &&
    DIGEST.test(source.bodyDigest ?? "");
}

function eventPlan(env) {
  if (env.GITHUB_ACTIONS !== "true" || !env.GITHUB_EVENT_PATH) return null;
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  // Event metadata records a producer's claimed subject, never task or approval authority.
  return extractPlanContract(event.pull_request?.body);
}

export function evidenceContext(env = process.env, options = {}) {
  const root = options.root ?? REPO_ROOT;
  const contract = options.contract === undefined
    ? readEvidenceJson("artifacts/task-contract.json", root)
    : options.contract;
  const plan = options.plan === undefined
    ? readEvidenceJson("artifacts/plan.json", root) ?? eventPlan(env)
    : options.plan;
  const source = readSourceState(root);
  const runId = env.NORTHSTAR_RUN_ID ?? env.GITHUB_RUN_ID ?? LOCAL_RUN_ID;
  const sourceRun = env.GITHUB_ACTIONS === "true" && env.NORTHSTAR_RUN_ID && env.NORTHSTAR_RUN_ID !== env.GITHUB_RUN_ID
    ? readEvidenceJson(SOURCE_RUN_PATH, root)
    : null;
  if (sourceRun && (
    sourceRun.schema !== "northstar/source-run/1" ||
    sourceRun.runId !== runId ||
    sourceRun.repository !== env.GITHUB_REPOSITORY ||
    sourceRun.headSha !== env.NORTHSTAR_HEAD_SHA
  )) {
    throw new Error("Source run context does not match the requested repository, run, and HEAD.");
  }
  const runAttempt = env.NORTHSTAR_RUN_ATTEMPT ?? sourceRun?.runAttempt ??
    (runId === env.GITHUB_RUN_ID ? env.GITHUB_RUN_ATTEMPT : null) ??
    (env.GITHUB_ACTIONS !== "true" && !env.GITHUB_RUN_ID ? "1" : null);
  const context = {
    repository: env.GITHUB_REPOSITORY ?? "local",
    taskId: contract?.id ?? plan?.taskId ?? null,
    contractDigest: contract?.source?.bodyDigest ?? plan?.contractDigest ?? null,
    planDigest: plan ? planDigest(plan) : null,
    headSha: env.NORTHSTAR_HEAD_SHA ?? env.GITHUB_SHA ?? source.headSha,
    baseSha: env.BASE_SHA ?? plan?.baseSha ?? sourceRun?.baseSha ?? null,
    runId,
    runAttempt,
    pullRequest: env.PR_NUMBER ? Number(env.PR_NUMBER) : null,
    source,
    executionRunId: env.GITHUB_RUN_ID ?? runId,
    executionRunAttempt: env.GITHUB_RUN_ATTEMPT ?? runAttempt,
    workflow: env.GITHUB_WORKFLOW ?? "local",
    event: env.GITHUB_EVENT_NAME ?? "local",
    actor: env.GITHUB_ACTOR ?? "local",
    validationStartedAt: env.NORTHSTAR_VALIDATION_STARTED_AT ?? null,
  };
  if (sourceRun && (
    sourceRun.runAttempt !== context.runAttempt ||
    sourceRun.baseSha !== context.baseSha ||
    sourceRun.taskId !== context.taskId ||
    sourceRun.contractDigest !== context.contractDigest ||
    (plan && sourceRun.planDigest !== context.planDigest)
  )) {
    throw new Error("Source run context does not match the task, plan, base, or run attempt.");
  }
  return context;
}

export function artifactErrors(record, root = REPO_ROOT) {
  const errors = [];
  const allowed = CHECK_ARTIFACTS[record.id];
  if (record.artifact === null) {
    if (!allowed || allowed.length > 0) errors.push("required artifact missing");
    if (record.artifactDigest !== null) errors.push("digest without an artifact");
    return errors;
  }
  if (typeof record.artifact !== "string" || !record.artifact.trim()) {
    return ["invalid artifact path"];
  }
  if (allowed && !allowed.includes(record.artifact)) errors.push("unexpected artifact path");
  try {
    const digest = digestPath(record.artifact, root);
    if (!digest) errors.push("artifact missing or empty directory");
    if (!DIGEST.test(record.artifactDigest ?? "") || !digest || record.artifactDigest !== digest) {
      errors.push("artifact digest mismatch");
    }
    if (digest && record.artifact.endsWith(".json")) {
      const data = readEvidenceJson(record.artifact, root);
      const schemas = {
        "plan-contract": "northstar/plan/1",
        "plan-approval": "northstar/plan/1",
        "scope-policy": "northstar/scope-report/1",
        "merge-validation": "northstar/merge-report/1",
        "governance-policy": "northstar/governance-report/1",
        "repository-controls": "northstar/governance-report/1",
        "validation-authority": "northstar/validation-authority-report/1",
        "browser-plan-canary": "northstar/browser-plan-canary/1",
      };
      if (schemas[record.id] && data?.schema !== schemas[record.id]) errors.push("artifact schema mismatch");
      if (record.id.startsWith("plan-") && (
        data?.taskId !== record.provenance?.taskId || data?.contractDigest !== record.provenance?.contractDigest ||
        data?.baseSha !== record.provenance?.baseSha || planDigest(data) !== record.provenance?.planDigest
      )) errors.push("plan artifact identity mismatch");
      if (["scope-policy", "merge-validation", "validation-authority"].includes(record.id)) {
        if (typeof data?.ok !== "boolean") errors.push("artifact outcome missing");
        const maintenanceApproval = record.id === "validation-authority" &&
          record.provenance?.workflow === "System Maintenance Approval" &&
          record.category === "approval" && Array.isArray(data?.changedAuthority) && data.changedAuthority.length > 0;
        if (record.status === "pass" && data?.ok !== true && !maintenanceApproval) errors.push("artifact outcome failed");
      }
      if (record.id === "scope-policy" && (
        data?.taskId !== record.provenance?.taskId || data?.contractDigest !== record.provenance?.contractDigest ||
        !Array.isArray(data?.paths) || !Array.isArray(data?.violations) ||
        (record.status === "pass" && data.violations.length > 0) ||
        (data?.headSha !== undefined && data.headSha !== record.provenance?.headSha) ||
        (data?.baseSha !== undefined && data.baseSha !== record.provenance?.baseSha)
      )) errors.push("scope artifact is incomplete or mismatched");
      if (record.id === "merge-validation" && data?.base !== record.provenance?.baseSha) {
        errors.push("merge artifact base mismatch");
      }
      if (["governance-policy", "repository-controls"].includes(record.id)) {
        if (!Array.isArray(data?.checks) || data.checks.length === 0 ||
          data.checks.some((check) => typeof check?.id !== "string" || typeof check?.ok !== "boolean") ||
          typeof data?.sourceControlsReady !== "boolean") errors.push("governance artifact is incomplete");
        if (record.status === "pass" && (data?.sourceControlsReady !== true ||
          data.checks?.some((check) => check.ok !== true))) errors.push("governance artifact outcome failed");
        if (record.id === "repository-controls" && record.status === "pass" &&
          (data?.online?.available !== true || data?.online?.ready !== true)) errors.push("hosted controls are unverified");
      }
      if (record.id === "dependency-review") {
        const counts = data?.metadata?.vulnerabilities;
        if (!counts || typeof counts !== "object" || Array.isArray(counts) ||
          !Number.isSafeInteger(counts.high) || counts.high < 0 ||
          !Number.isSafeInteger(counts.critical) || counts.critical < 0) errors.push("dependency audit is malformed");
        else if (record.status === "pass" && counts.high + counts.critical > 0) errors.push("dependency audit contains blocking findings");
      }
      if (record.id === "browser-plan-canary") {
        const source = data?.source;
        const canary = data?.canary;
        const binding = canary?.canaryFor;
        const sourceFields = [
          "repository", "taskId", "contractDigest", "planDigest",
          "headSha", "baseSha", "pullRequest", "runId", "runAttempt",
        ];
        if (!source || typeof source !== "object" || sourceFields.some((field) =>
          source[field] !== record.provenance?.[field])) {
          errors.push("browser canary source identity mismatch");
        }
        if (!/^[1-9]\d*$/.test(source?.evidenceRunId ?? "") ||
          !Array.isArray(data?.criterionIds) || data.criterionIds.length !== 1 || data.criterionIds[0] !== "AC15" ||
          typeof data?.verifiedAt !== "string" || !Number.isFinite(Date.parse(data.verifiedAt))) {
          errors.push("browser canary evidence identity is incomplete");
        }
        if (!canary || !Number.isSafeInteger(canary.pullRequest) || canary.pullRequest < 1 ||
          canary.pullRequest === source?.pullRequest || !SHA.test(canary.headSha ?? "") ||
          !SHA.test(canary.baseSha ?? "") || !DIGEST.test(canary.planDigest ?? "") ||
          canary.url !== `https://github.com/${String(source?.repository ?? "")}/pull/${canary.pullRequest}` ||
          canary.artifactPath !== `docs/plans/${String(source?.taskId ?? "").toLowerCase()}.md` ||
          !SHA.test(canary.artifactBlobSha ?? "") || canary.reviewedCommit !== canary.headSha ||
          String(canary.reviewState).toUpperCase() !== "APPROVED" ||
          !Number.isSafeInteger(canary.reviewId) || canary.reviewId < 1 ||
          typeof canary.reviewer !== "string" || !canary.reviewer.trim() ||
          !canary.planAuthor || canary.reviewer === canary.planAuthor ||
          !Number.isFinite(Date.parse(canary.approvedAt ?? ""))) {
          errors.push("browser canary review or plan artifact identity is invalid");
        }
        if (!binding || typeof binding !== "object" ||
          binding.sourceTaskId !== source?.taskId ||
          binding.sourceContractDigest !== source?.contractDigest ||
          binding.sourcePlanDigest !== source?.planDigest ||
          binding.sourceBaseSha !== source?.baseSha ||
          binding.sourcePullRequest !== source?.pullRequest ||
          binding.sourceHeadSha !== source?.headSha ||
          binding.sourceRunId !== source?.runId ||
          binding.sourceRunAttempt !== source?.runAttempt ||
          binding.sourceEvidenceRunId !== source?.evidenceRunId ||
          !Number.isSafeInteger(binding.bootstrapPlanPr) || binding.bootstrapPlanPr < 1 ||
          !SHA.test(binding.bootstrapPlanHeadSha ?? "") ||
          !Number.isSafeInteger(binding.bootstrapReviewId) || binding.bootstrapReviewId < 1 ||
          typeof binding.bootstrapReviewer !== "string" || !binding.bootstrapReviewer.trim()) {
          errors.push("browser canary does not bind the original approved plan and implementation");
        }
      }
      if (record.id === "validation-authority" && (
        data?.headSha !== record.provenance?.headSha || data?.pullRequest !== record.provenance?.pullRequest ||
        !Array.isArray(data?.changedAuthority)
      )) errors.push("validation authority artifact identity mismatch");
    }
    if (digest && record.id === "codeql") {
      const sarifFiles = filesUnder(evidencePath(record.artifact, root)).filter((file) => file.endsWith(".sarif"));
      if (sarifFiles.length === 0) errors.push("CodeQL artifact has no SARIF files");
      for (const file of sarifFiles) {
        const sarif = readEvidenceJson(file, root);
        if (sarif?.version !== "2.1.0" || !Array.isArray(sarif.runs) || sarif.runs.length === 0 ||
          sarif.runs.some((run) => typeof run?.tool?.driver?.name !== "string" || !run.tool.driver.name || !Array.isArray(run.results))) {
          errors.push("CodeQL artifact is malformed");
        } else if (record.status === "pass" && sarif.runs.some((run) => run.results.length > 0)) {
          errors.push("CodeQL artifact contains findings");
        }
      }
    }
  } catch (error) {
    errors.push(`artifact unreadable or malformed: ${error.message}`);
  }
  return errors;
}

export function validateCheckRecord(record, expected, { root = REPO_ROOT, hosted = false } = {}) {
  const reasons = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, reasons: ["invalid evidence record"] };
  }
  if (record.schema !== CHECK_SCHEMA) reasons.push("invalid schema");
  if (!CHECK_STATUSES.includes(record.status)) reasons.push("invalid status");
  if (typeof record.category !== "string" || !record.category.trim() || typeof record.summary !== "string") {
    reasons.push("invalid evidence description");
  }
  if (!/^[a-z][a-z0-9-]*$/.test(record.id ?? "")) reasons.push("invalid check id");
  if (record.required !== true) reasons.push("required check marked optional");
  const provenance = record.provenance ?? {};
  const fields = {
    repository: "repository",
    taskId: "task",
    contractDigest: "task contract digest",
    planDigest: "plan digest",
    headSha: "head SHA",
    baseSha: "base SHA",
    runId: "workflow run",
    runAttempt: "run attempt",
  };
  for (const [field, label] of Object.entries(fields)) {
    if (typeof expected[field] !== "string" || !expected[field] ||
      provenance[field] !== expected[field]) {
      reasons.push(`${label} mismatch or missing`);
    }
  }
  for (const field of ["headSha", "baseSha"]) {
    if (!SHA.test(provenance[field] ?? "")) reasons.push(`invalid ${field}`);
  }
  for (const field of ["planDigest", "contractDigest"]) {
    if (!DIGEST.test(provenance[field] ?? "")) reasons.push(`invalid ${field}`);
  }
  if (!/^[1-9]\d*$/.test(provenance.runAttempt ?? "")) reasons.push("invalid run attempt");
  if (provenance.pullRequest !== expected.pullRequest ||
    (hosted && (!Number.isSafeInteger(expected.pullRequest) || expected.pullRequest < 1))) {
    reasons.push("pull request mismatch or missing");
  }
  if (typeof provenance.actor !== "string" || !provenance.actor.trim() ||
    (hosted && provenance.actor === "local")) reasons.push("actor missing");
  if (provenance.job !== record.id) reasons.push("job identity mismatch");
  const revalidated = hosted && REVALIDATED_CHECKS.has(record.id) &&
    ["Publish Evidence", "System Maintenance Approval"].includes(provenance.workflow);
  const candidatePolicy = hosted && CANDIDATE_POLICY_CHECKS.has(record.id) &&
    expected.workflow === "Governed Change" &&
    ["pull_request", "pull_request_review"].includes(expected.event) &&
    provenance.workflow === "Governed Change" &&
    ["pull_request", "pull_request_review"].includes(provenance.event);
  if (hosted && REVALIDATED_CHECKS.has(record.id) && !revalidated && !candidatePolicy) {
    reasons.push("trusted current-run revalidation missing");
  }
  const producerRun = revalidated ? expected.executionRunId : expected.runId;
  const producerAttempt = revalidated ? expected.executionRunAttempt : expected.runAttempt;
  if (provenance.executionRunId !== producerRun ||
    provenance.executionRunAttempt !== producerAttempt) {
    reasons.push("producer run or attempt mismatch");
  }
  if (hosted) {
    const event = revalidated
      ? provenance.workflow === "Publish Evidence" ? "workflow_run" : "workflow_dispatch"
      : provenance.event;
    if (revalidated ? (
      provenance.workflow !== expected.workflow || provenance.event !== event ||
      provenance.actor !== expected.actor
    ) : (
      provenance.workflow !== "Governed Change" ||
      !["pull_request", "pull_request_review"].includes(provenance.event)
    )) reasons.push("workflow identity mismatch");
  } else if (provenance.workflow !== "local" || provenance.event !== "local") {
    reasons.push("local producer identity mismatch");
  }
  if (provenance.source?.dirty !== false) reasons.push("producer source is dirty or unknown");
  if (provenance.source?.headSha !== (revalidated ? expected.source.headSha : expected.headSha)) {
    reasons.push("producer source HEAD mismatch");
  }
  const producedAt = Date.parse(record.producedAt);
  if (typeof record.producedAt !== "string" || !Number.isFinite(producedAt) || producedAt > Date.now() ||
    (expected.validationStartedAt && producedAt < Date.parse(expected.validationStartedAt))) {
    reasons.push("evidence timestamp is invalid or stale");
  }
  reasons.push(...artifactErrors(record, root));
  return { valid: reasons.length === 0, reasons };
}

export function createCheckRecord(input, env = process.env, options = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(input.id ?? "") || !CHECK_STATUSES.includes(input.status)) {
    throw new Error("Check evidence requires an id and a valid status.");
  }
  const root = options.root ?? REPO_ROOT;
  const context = evidenceContext(env, options);
  const artifact = input.artifact ?? null;
  const record = {
    schema: CHECK_SCHEMA,
    id: input.id,
    category: input.category ?? "execution result",
    status: input.status,
    required: input.required !== false,
    summary: input.summary ?? "",
    artifact,
    artifactDigest: digestPath(artifact, root),
    producedAt: input.producedAt ?? new Date().toISOString(),
    provenance: {
      ...context,
      job: env.NORTHSTAR_JOB_ID ?? env.GITHUB_JOB ?? input.id,
    },
  };
  const errors = artifactErrors(record, root);
  if (record.status === "pass" && errors.length > 0) {
    throw new Error(`Cannot record passing ${input.id} evidence: ${errors.join("; ")}.`);
  }
  return record;
}

export function writeCheckRecord(record, out, root = REPO_ROOT) {
  if (!/^[a-z][a-z0-9-]*$/.test(record.id ?? "")) throw new Error("Invalid check id.");
  const target = evidencePath(out ?? `artifacts/checks/${record.id}.json`, root);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return target;
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const id = valueOf("--id");
  const status = valueOf("--status");
  if (!id || !status) {
    process.stderr.write(
      "Pass --id <check> --status <pass|fail|skipped|not-run>.\n",
    );
    process.exit(2);
  }
  const record = createCheckRecord(
    {
      id,
      status,
      category: valueOf("--category"),
      summary: valueOf("--summary"),
      artifact: valueOf("--artifact"),
      required: !process.argv.includes("--optional"),
    },
    {
      ...process.env,
      ...(valueOf("--job") ? { NORTHSTAR_JOB_ID: valueOf("--job") } : {}),
    },
  );
  const target = writeCheckRecord(record, valueOf("--out"));
  process.stdout.write(
    `${record.id}=${record.status} sha=${record.provenance.headSha ?? "unknown"} artifact=${record.artifact ? basename(record.artifact) : "none"}\n${target}\n`,
  );
  if (record.status === "fail") {
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Evidence producer failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
