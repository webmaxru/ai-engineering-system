import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchApprovedPlan, implementationBranch } from "./publish-plan.mjs";
import { validatePlanContract } from "./plan-contract.mjs";
import { contractFromIssue } from "./task-contract.mjs";
import { resolveTask } from "./resolve-task.mjs";
import { assertWorkspaceOwner, readWorkspaceOwner, workspaceOwnerIdentity } from "./workspace-owner.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function git(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function contained(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

export function validateWorktreeDestination(repositoryRoot, requestedPath, { allowExisting = false } = {}) {
  if (!isAbsolute(requestedPath ?? "")) {
    throw new Error("The task worktree destination must be an absolute path.");
  }
  const parent = dirname(resolve(requestedPath));
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error("The task worktree parent must be an existing regular directory.");
  }
  const root = resolve(repositoryRoot);
  const target = resolve(realpathSync(parent), basename(requestedPath));
  if (contained(realpathSync(root), target) || contained(target, realpathSync(root))) {
    throw new Error("The isolated task worktree must be outside the current repository tree.");
  }
  let targetStat = null;
  try {
    targetStat = lstatSync(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (targetStat?.isSymbolicLink()) {
    throw new Error("The task worktree destination cannot be a symbolic link.");
  }
  if (targetStat && (!allowExisting || !targetStat.isDirectory())) {
    throw new Error("The task worktree destination already exists; it will not be overwritten.");
  }
  return target;
}

export function parseWorktreeList(raw) {
  const entries = [];
  let current = null;
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    if (!line) {
      if (current) entries.push(current);
      current = null;
      continue;
    }
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: line.slice("worktree ".length), branch: null, detached: false };
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    } else if (current && line === "detached") {
      current.detached = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

export function verifyTaskWorktree({ target, branch, baseSha }, run = git) {
  const currentBranch = run(["-C", target, "branch", "--show-current"]).trim();
  const currentHead = run(["-C", target, "rev-parse", "HEAD"]).trim();
  if (currentBranch !== branch) {
    throw new Error(`Selected worktree is on ${currentBranch || "<detached>"}, not ${branch}.`);
  }
  if (!/^[0-9a-f]{40}$/.test(currentHead)) {
    throw new Error("Selected worktree HEAD is not an immutable commit.");
  }
  run(["-C", target, "merge-base", "--is-ancestor", baseSha, currentHead]);
  return { branch: currentBranch, headSha: currentHead };
}

function expectedOwner(root, contract, sessionId) {
  return workspaceOwnerIdentity({
    root,
    issue: contract.source.issue,
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    sessionId,
    contract,
  });
}

function resolveSelectedWorktree({
  issue, contract, plan, approved, target, sessionId, resolveTaskImpl,
}) {
  const owner = readWorkspaceOwner(target);
  const expected = expectedOwner(target, contract, sessionId);
  if (!owner || owner.ownerKey !== expected.ownerKey ||
      owner.taskId !== contract.id ||
      owner.contractDigest !== contract.source.bodyDigest) {
    throw new Error("The existing worktree is not owned by this exact task session; it was not adopted.");
  }
  assertWorkspaceOwner(target, expected);
  const selected = resolveTaskImpl(issue, {
    root: target,
    role: "implement",
    sessionId,
    readContract: () => contract,
    readApprovedPlan: () => approved,
  });
  const materialized = JSON.parse(
    readFileSync(resolve(target, "artifacts/plan.json"), "utf8"),
  );
  if (selected.approvalState !== "approved" ||
      materialized.planDigest !== plan.planDigest ||
      materialized.baseSha !== plan.baseSha) {
    throw new Error("Existing task worktree did not resolve the exact current approved plan.");
  }
  return { path: target, branch: implementationBranch(contract.id), created: false };
}

export function provisionTaskWorktree({
  issue,
  requestedPath,
  sessionId,
  repositoryRoot = REPO_ROOT,
}, {
  readContract = contractFromIssue,
  readApprovedPlan = fetchApprovedPlan,
  run = git,
  selectExisting = resolveSelectedWorktree,
  resolveTask: resolveTaskImpl = resolveTask,
} = {}) {
  if (!Number.isSafeInteger(issue) || issue < 1 ||
      typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Workspace preparation requires an explicit issue and session ID.");
  }
  const contract = readContract(issue);
  if (contract.source?.trusted !== true || contract.source.issue !== issue) {
    throw new Error("Workspace preparation requires the requested trusted live task.");
  }
  const approved = readApprovedPlan(contract);
  if (!approved?.plan || approved.plan.taskId !== contract.id ||
      approved.plan.contractDigest !== contract.source.bodyDigest ||
      approved.approval?.reviewedCommit !== approved.pr?.headRefOid) {
    throw new Error("No current native approved plan is available for this task.");
  }
  const validation = validatePlanContract(approved.plan, contract);
  if (!validation.ok) throw new Error(`The approved plan is invalid: ${validation.errors.join("; ")}`);
  const target = validateWorktreeDestination(repositoryRoot, requestedPath, { allowExisting: true });
  const branch = implementationBranch(contract.id);
  run(["fetch", "origin", approved.plan.baseBranch]);
  const fetchedBase = run(["rev-parse", `origin/${approved.plan.baseBranch}`]).trim();
  if (fetchedBase !== approved.plan.baseSha) {
    throw new Error("The remote task base moved; refresh and re-approve the plan.");
  }
  const entries = parseWorktreeList(run(["worktree", "list", "--porcelain"]));
  const existing = entries.find(({ branch: ref }) => ref === `refs/heads/${branch}`);
  if (existing) {
    if (resolve(existing.path) !== target) {
      throw new Error(`The task branch is already checked out at ${existing.path}; no checkout was switched.`);
    }
    const selectedWorktree = verifyTaskWorktree({
      target, branch, baseSha: approved.plan.baseSha,
    }, run);
    return selectExisting({
      issue, contract, plan: approved.plan, approved, target, sessionId,
      resolveTaskImpl, workspace: selectedWorktree,
    });
  }
  if (existsSync(target)) {
    throw new Error("The task worktree destination already exists; it will not be overwritten.");
  }
  const localBranch = run(["branch", "--list", branch]).trim();
  if (localBranch) {
    throw new Error("The implementation branch already exists without a matching active worktree; inspect it before reuse.");
  }
  const remoteBranch = run(["ls-remote", "--heads", "origin", `refs/heads/${branch}`]).trim();
  if (remoteBranch) {
    throw new Error("The remote implementation branch already exists; inspect it before reuse.");
  }
  run(["worktree", "add", "-b", branch, target, approved.plan.baseSha]);
  const createdWorktree = verifyTaskWorktree({
    target, branch, baseSha: approved.plan.baseSha,
  }, run);
  const resolved = resolveTaskImpl(issue, {
    root: target,
    role: "implement",
    sessionId,
    readContract: () => contract,
    readApprovedPlan: () => approved,
  });
  if (resolved.approvalState !== "approved") {
    throw new Error("The newly created worktree did not resolve the current approved plan.");
  }
  return {
    path: target, branch, baseSha: approved.plan.baseSha,
    headSha: createdWorktree.headSha, created: true,
  };
}

function main() {
  const issue = Number(valueOf("--issue"));
  const requestedPath = valueOf("--path");
  const sessionId = valueOf("--session-id") ??
    process.env.COPILOT_SESSION_ID ??
    process.env.COPILOT_SESSION_UUID;
  try {
    const result = provisionTaskWorktree({ issue, requestedPath, sessionId });
    process.stdout.write(
      `task=${result.branch} worktree=${result.path} created=${result.created}\n`,
    );
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
