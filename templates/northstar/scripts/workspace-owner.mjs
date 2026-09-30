import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { workspacePath } from "./workspace-path.mjs";

export const WORKSPACE_OWNER_PATH = "artifacts/task-workspace-owner.json";
export const TASK_AUTHORITY_PATHS = Object.freeze([
  "artifacts/task-contract.json",
  "artifacts/task-plan.md",
  "artifacts/plan-proposal.md",
  "artifacts/plan.json",
  "artifacts/approved-plan.json",
  "artifacts/candidate-plan.json",
  "artifacts/task-session.json",
  "artifacts/execution-context.json",
]);
const WORKSPACE_LOCK_PATH = "artifacts/.task-workspace-resolution.lock";
const OWNER_SCHEMA = "northstar/task-workspace-owner/1";

function repositoryFromContract(contract) {
  return /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/\d+$/
    .exec(contract?.source?.url ?? "")?.[1] ?? null;
}

function repositoryFromWorkspace(root) {
  let remote;
  try {
    remote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("Workspace ownership requires GITHUB_REPOSITORY or a Git origin remote.");
  }
  const match = /(?:[:/]([^/:]+\/[^/]+?))(?:\.git)?$/.exec(remote);
  if (!match) throw new Error("The Git origin remote does not identify an owner/repository.");
  return match[1];
}

function executionIdentity(sessionId, env) {
  const explicit = sessionId ?? env.COPILOT_SESSION_ID ??
    env.COPILOT_SESSION_UUID ?? env.COPILOT_AGENT_SESSION_ID;
  if (typeof explicit === "string" && explicit.trim()) {
    return `copilot-session:${explicit.trim()}`;
  }
  if (env.GITHUB_ACTIONS === "true" &&
      /^[^/\s]+\/[^/\s]+$/.test(env.GITHUB_REPOSITORY ?? "") &&
      /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? "") &&
      /^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? "")) {
    return `github-actions:${env.GITHUB_REPOSITORY}:${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}`;
  }
  throw new Error("Task workspace ownership requires an explicit Copilot session or workflow run identity.");
}

export function workspaceOwnerIdentity({
  root,
  issue,
  taskId = null,
  contractDigest = null,
  sessionId = null,
  env = process.env,
  contract = null,
}) {
  const demoWorkspace = issue === null && taskId === null && contractDigest === null;
  if (!demoWorkspace && (!Number.isSafeInteger(issue) || issue < 1)) {
    throw new Error("Workspace ownership requires a positive task issue.");
  }
  const workspaceRoot = realpathSync(resolve(root));
  const repository = env.GITHUB_REPOSITORY ??
    repositoryFromContract(contract) ??
    repositoryFromWorkspace(workspaceRoot);
  if (typeof repository !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error("Workspace ownership requires an exact owner/repository identity.");
  }
  const identity = executionIdentity(sessionId, env);
  const ownerKey = createHash("sha256")
    .update(`${workspaceRoot}\0${repository}\0${identity}`)
    .digest("hex");
  return {
    schema: OWNER_SCHEMA,
    ownerKey,
    repository,
    issue,
    taskId,
    contractDigest,
  };
}

function ownerPath(root) {
  return workspacePath(WORKSPACE_OWNER_PATH, root);
}

function lockPath(root) {
  return workspacePath(WORKSPACE_LOCK_PATH, root);
}

export function unownedTaskAuthorityPaths(root) {
  return TASK_AUTHORITY_PATHS.filter((path) => existsSync(resolve(root, path)));
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

function recoverStaleLock(lock, identity) {
  let current;
  try {
    current = JSON.parse(readFileSync(lock, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw new Error(`Workspace resolution lock is malformed; fail closed: ${error.message}`, { cause: error });
  }
  if (!current || typeof current !== "object" || Array.isArray(current) ||
      current.schema !== OWNER_SCHEMA ||
      !/^[0-9a-f]{64}$/.test(current.ownerKey ?? "") ||
      !Number.isSafeInteger(current.pid) || current.pid < 1 ||
      typeof current.hostname !== "string" || !current.hostname ||
      typeof current.token !== "string" || !current.token ||
      !Number.isFinite(Date.parse(current.startedAt))) {
    throw new Error("Workspace resolution lock is invalid; fail closed.");
  }
  if (current.ownerKey !== identity.ownerKey || current.hostname !== hostname() ||
      processIsAlive(current.pid)) return false;

  let latest;
  try {
    latest = JSON.parse(readFileSync(lock, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw new Error(`Workspace resolution lock changed during recovery: ${error.message}`, { cause: error });
  }
  if (latest.token !== current.token || latest.ownerKey !== current.ownerKey ||
      latest.pid !== current.pid || latest.hostname !== current.hostname ||
      processIsAlive(latest.pid)) return false;
  unlinkSync(lock);
  return true;
}

export function readWorkspaceOwner(root) {
  const target = ownerPath(root);
  if (!existsSync(target)) return null;
  let owner;
  try {
    owner = JSON.parse(readFileSync(target, "utf8"));
  } catch (error) {
    throw new Error(`Workspace owner record is malformed; fail closed: ${error.message}`, { cause: error });
  }
  if (!owner || typeof owner !== "object" || Array.isArray(owner) ||
      owner.schema !== OWNER_SCHEMA ||
      !/^[0-9a-f]{64}$/.test(owner.ownerKey ?? "") ||
      !((Number.isSafeInteger(owner.issue) && owner.issue > 0) ||
        (owner.issue === null && owner.taskId === null && owner.contractDigest === null)) ||
      typeof owner.repository !== "string" || !owner.repository) {
    throw new Error("Workspace owner record is invalid; fail closed.");
  }
  return owner;
}

function matchesOwner(current, expected) {
  return current.ownerKey === expected.ownerKey &&
    current.repository === expected.repository &&
    current.issue === expected.issue &&
    (expected.taskId === null || current.taskId === null || current.taskId === expected.taskId) &&
    (expected.contractDigest === null || current.contractDigest === null ||
      current.contractDigest === expected.contractDigest);
}

function writeOwnerAtomic(root, owner, { exclusive = false } = {}) {
  const target = ownerPath(root);
  mkdirSync(dirname(target), { recursive: true });
  if (exclusive) {
    const fd = openSync(target, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(owner, null, 2)}\n`, "utf8");
      fsyncSync(fd);
    } catch (error) {
      try {
        closeSync(fd);
        unlinkSync(target);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Workspace owner creation and cleanup failed.",
          { cause: cleanupError },
        );
      }
      throw error;
    }
    closeSync(fd);
    return;
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(owner, null, 2)}\n`, "utf8");
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    unlinkSync(temporary);
    throw error;
  }
  closeSync(fd);
  renameSync(temporary, target);
}

export function claimWorkspaceOwner({
  root,
  issue,
  taskId = null,
  contractDigest = null,
  sessionId = null,
  env = process.env,
  contract = null,
  allowUnownedState = false,
  allowUnownedStatePaths = [],
}) {
  const identity = workspaceOwnerIdentity({
    root, issue, taskId, contractDigest, sessionId, env, contract,
  });
  const lock = lockPath(root);
  mkdirSync(dirname(lock), { recursive: true });
  const lockToken = randomUUID();
  let fd;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fd = openSync(lock, "wx", 0o600);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (attempt === 0 && recoverStaleLock(lock, identity)) continue;
      throw new Error("Another resolver or different workspace owner holds the task workspace; no state was changed.", { cause: error });
    }
  }
  try {
    writeFileSync(fd, `${JSON.stringify({
      schema: OWNER_SCHEMA,
      ownerKey: identity.ownerKey,
      pid: process.pid,
      hostname: hostname(),
      startedAt: new Date().toISOString(),
      token: lockToken,
    })}\n`, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  try {
    const current = readWorkspaceOwner(root);
    const unownedState = unownedTaskAuthorityPaths(root);
    if (allowUnownedState && current) {
      throw new Error("Explicit orphan cleanup is allowed only when no workspace owner exists.");
    }
    if (allowUnownedState && unownedState.length === 0) {
      throw new Error("No unowned task authority artifacts were found to clear.");
    }
    if (!current && unownedState.length > 0 && !allowUnownedState &&
        !unownedState.every((path) => allowUnownedStatePaths.includes(path))) {
      throw new Error(
        `Unowned task authority artifacts were preserved (${unownedState.join(", ")}). ` +
        "Use workspace release with --clear-unowned only after confirming they are obsolete.",
      );
    }
    if (current && !matchesOwner(current, identity)) {
      throw new Error(
        `Task workspace is already owned by task ${current.taskId ?? current.issue}; ` +
        "the conflicting session was rejected before changing task state.",
      );
    }
    if (!current) {
      const created = {
        ...identity,
        taskId,
        contractDigest,
        createdAt: new Date().toISOString(),
      };
      try {
        writeOwnerAtomic(root, created, { exclusive: true });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const racedOwner = readWorkspaceOwner(root);
        if (!racedOwner || !matchesOwner(racedOwner, identity)) {
          throw new Error(
            "Workspace ownership changed during claim; no task state was touched.",
            { cause: error },
          );
        }
      }
    }
    return { root: resolve(root), identity, lockToken };
  } catch (error) {
    try {
      const contents = JSON.parse(readFileSync(lock, "utf8"));
      if (contents.token === lockToken) unlinkSync(lock);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Workspace claim failed and its temporary lock could not be released: ${error.message}`,
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

export function assertWorkspaceOwner(root, claimOrIdentity = null) {
  const current = readWorkspaceOwner(root);
  if (!current) {
    if (claimOrIdentity) throw new Error("The claimed workspace owner record is missing.");
    return null;
  }
  if (!claimOrIdentity || !matchesOwner(current, claimOrIdentity)) {
    throw new Error(
      "Task workspace is owned by another session; task artifacts were not read, cleared, or changed.",
    );
  }
  return current;
}

export function bindWorkspaceOwner(claim, contract) {
  const current = assertWorkspaceOwner(claim.root, claim.identity);
  if (current.taskId && current.taskId !== contract.id) {
    throw new Error("The workspace owner task ID differs from the resolved task.");
  }
  const updated = {
    ...current,
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
  };
  if (current.taskId !== updated.taskId || current.contractDigest !== updated.contractDigest) {
    writeOwnerAtomic(claim.root, updated);
  }
  claim.identity = {
    ...claim.identity,
    taskId: updated.taskId,
    contractDigest: updated.contractDigest,
  };
  return updated;
}

export function releaseWorkspaceClaim(claim) {
  const path = lockPath(claim.root);
  let current;
  try {
    current = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new Error(`Workspace resolution lock is malformed: ${error.message}`, { cause: error });
  }
  if (current.token !== claim.lockToken || current.ownerKey !== claim.identity.ownerKey) {
    throw new Error("Workspace resolution lock ownership changed; it was not removed.");
  }
  unlinkSync(path);
}

export function removeWorkspaceOwner(claim) {
  const owner = assertWorkspaceOwner(claim.root, claim.identity);
  if (owner.issue !== claim.identity.issue) {
    throw new Error("Task issue does not own this workspace.");
  }
  unlinkSync(ownerPath(claim.root));
}

export async function releaseTaskWorkspace({
  root,
  issue,
  sessionId,
  env = process.env,
  allowUnownedState = false,
  allowUnownedStatePaths = [],
}, {
  clearTaskState,
} = {}) {
  if (typeof clearTaskState !== "function") {
    throw new Error("Workspace release requires the task-state cleanup function.");
  }
  const claim = claimWorkspaceOwner({
    root, issue, sessionId, env, allowUnownedState, allowUnownedStatePaths,
  });
  try {
    const owner = assertWorkspaceOwner(root, claim.identity);
    if (owner.issue !== issue) throw new Error("Task issue does not own this workspace.");
    clearTaskState(root, claim);
    removeWorkspaceOwner(claim);
    return owner;
  } finally {
    releaseWorkspaceClaim(claim);
  }
}
