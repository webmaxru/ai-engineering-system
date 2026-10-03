/**
 * Pre-tool-use authorization for agent tool calls.
 *
 * This turns the capability boundary written in AGENTS.md into a decision that
 * runs before a tool executes. The model may be persuaded by hostile text in a
 * README, an issue comment, or a dependency changelog. This check does not read
 * that text and does not care whether the model was persuaded: it only inspects
 * the tool call that was actually requested.
 *
 * Contract:
 *   stdin  -> {"toolName": "...", "toolArgs": { ... }}
 *   stdout -> {"permissionDecision": "allow" | "deny", "permissionDecisionReason": "..."}
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { posix, resolve, win32 } from "node:path";
import {
  DEFAULT_SCOPE,
  isPathAllowed,
  loadTaskContract,
  matchesPattern,
  splitProhibitions,
  taskScope,
} from "./task-contract.mjs";
import { planDigest, validatePlanContract } from "./plan-contract.mjs";
import { planArtifactPath } from "./plan-artifact.mjs";
import { approvalPolicyForRisk } from "./risk-policy.mjs";
import { assertWorkspaceOwner, readWorkspaceOwner, workspaceOwnerIdentity } from "./workspace-owner.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

/**
 * Repository-wide fallback, used when no task contract is in scope. A task
 * contract narrows this; nothing widens it.
 */
export const WRITABLE_PATH_PREFIXES = Object.freeze([]);

const ALLOWED_COMMANDS = [
  // Resolving the contract must be allowed, or the agent cannot bootstrap the
  // very boundary that governs it. It only reads an issue and writes into
  // artifacts/, so it grants no authority over the working tree.
  /^npm run contract:fetch -- --issue [1-9]\d*(?: --session-id [A-Za-z0-9._-]+)?$/,
  /^npm run plan:show$/,
  /^npm run plan:gate -- --pr \d+$/,
  /^npm run lint$/,
  /^npm run typecheck$/,
  /^npm run build$/,
  /^npm run test:unit$/,
  /^npm run test:unit -- (?:tests\/unit\/[A-Za-z0-9._/-]+\.test\.ts)(?: tests\/unit\/[A-Za-z0-9._/-]+\.test\.ts)*$/,
  /^npm run workspace:prepare -- --issue [1-9]\d* --path \S+ --session-id [A-Za-z0-9._-]+$/,
  /^npm run workspace:release -- --issue [1-9]\d* --session-id [A-Za-z0-9._-]+(?: --clear-unowned)?$/,
  /^npm run test:acceptance$/,
  /^npm run governance:check$/,
  /^npm run security:secrets$/,
  /^npm run scope:check -- --base [A-Za-z0-9._/-]+$/,
  /^npm run validate$/,
  /^npm run validate:all$/,
  /^npm run evidence$/,
  /^git status(?: --short| --porcelain| --short --branch)?$/,
  /^git diff(?: --check| --stat| --name-only| --cached)?$/,
  /^git log(?: --oneline| --decorate| --graph| --stat| -\d+)*$/,
];

const SHELL_METACHARACTERS = /(?:&&|\|\||[;&|><`^]|\r|\n|\$\(|\$\{)/;

/**
 * Commands that prepare the environment rather than validate the change.
 *
 * These are not dangerous, and the evidence bundle cannot be produced without
 * them: AGENTS.md requires acceptance tests, and the acceptance suite requires
 * PostgreSQL. Denying them outright makes the contract demand evidence the
 * boundary forbids producing.
 *
 * They are also not the agent's to decide. Starting a container mutates the
 * developer's machine, and in the cloud agent the database arrives as a service
 * container instead. So: ask, and name the human action in the reason.
 */
const ENVIRONMENT_COMMANDS = [
  {
    pattern: /^npm ci$/,
    action: "installs the lockfile-defined dependency tree and may run package lifecycle scripts",
  },
  {
    pattern: /^npm run db:(up|down)$/,
    action: "starts or stops the local PostgreSQL container",
  },
  {
    pattern: /^docker compose (up|down)\b/,
    action: "changes local container state",
  },
];

const DENIED_COMMAND_PATTERNS = [
  { pattern: /\bgit\s+push\b/, reason: "publishing requires human approval" },
  {
    pattern: /\bgh\s+(pr\s+merge|release)\b/,
    reason: "merging and releasing require human approval",
  },
  {
    pattern: /\bnpm\s+(i|install|add)\s+\S/,
    reason: "adding a dependency is outside the capability boundary",
  },
  {
    pattern: /\b(printenv|env)\b/,
    reason: "environment enumeration is not needed for this task",
  },
  {
    pattern: /\$\{?[A-Z_]*(TOKEN|SECRET|PASSWORD|KEY)\b/,
    reason: "secret material must not flow through a tool call",
  },
  {
    pattern: /\b(curl|wget|nc|Invoke-WebRequest|Invoke-RestMethod)\b/,
    reason: "outbound network calls are not in the allowlist",
  },
  {
    pattern: /\bDROP\s+(TABLE|COLUMN|DATABASE)\b/i,
    reason: "destructive schema change requires human approval",
  },
  {
    pattern: /\brm\s+-rf\b/,
    reason: "recursive delete is outside the capability boundary",
  },
];

function normalize(filePath) {
  return String(filePath).replace(/\\/g, "/").replace(/^\.\//, "");
}

export function normalizeEditPath(filePath, repoRoot = REPO_ROOT) {
  if (typeof filePath !== "string" || !filePath || /[\0\r\n]/.test(filePath)) {
    throw new Error("An edit target is missing or malformed.");
  }
  let input = filePath;
  if (/^file:/i.test(input)) input = fileURLToPath(input);
  else if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^[a-z]:[\\/]/i.test(input)) {
    throw new Error("Only repository files may be edited.");
  }
  if (input.replace(/\\/g, "/").split("/").includes("..")) {
    throw new Error("Parent traversal is not an authorized edit path.");
  }
  const paths = /^[a-z]:[\\/]|^\\\\/i.test(repoRoot) ? win32 : posix;
  const absolute = paths.resolve(repoRoot, input);
  const relative = paths.relative(paths.resolve(repoRoot), absolute);
  if (!relative || paths.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${paths.sep}`)) {
    throw new Error("The edit target is outside the repository.");
  }
  const segments = relative.split(paths.sep);
  if (segments.some((segment) =>
    segment === ".git" || /[<>:"|?*]/.test(segment) || /[ .]$/.test(segment) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
  )) throw new Error("The edit target is not a portable repository file.");
  let cursor = paths.resolve(repoRoot);
  for (const segment of segments) {
    cursor = paths.join(cursor, segment);
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error("Symbolic-link edit targets are not authorized.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return relative.replace(/\\/g, "/");
}

function allow(reason) {
  return { permissionDecision: "allow", permissionDecisionReason: reason };
}

function deny(reason) {
  return { permissionDecision: "deny", permissionDecisionReason: reason };
}

/**
 * Hand the decision to the human.
 *
 * Used when the policy genuinely cannot tell. Denying an unrecognized tool
 * sounds safer, but it breaks the agent on its first unfamiliar read and the
 * usual response is to switch the hook off entirely - which removes the
 * boundary completely. Asking keeps the boundary on and surfaces the tool name.
 */
function ask(reason) {
  return { permissionDecision: "ask", permissionDecisionReason: reason };
}

/**
 * Classify a tool by capability, not by an exhaustive list of names.
 *
 * Tool names are host-specific, numerous, and change between releases. VS Code
 * alone ships readFile, listDirectory, fileSearch, textSearch, usages,
 * problems, changes, runTests and more. An allowlist of names cannot keep up,
 * and denying every unrecognized name breaks the agent on its first read.
 *
 * So: recognize capability from explicit names first, then from the shape of
 * the name, and treat anything still unknown as "ask" rather than "deny".
 */
const EXPLICIT_KINDS = {
  read: "read",
  readfile: "read",
  view: "read",
  search: "read",
  codebase: "read",
  fetch: "read",
  usages: "read",
  problems: "read",
  changes: "read",
  edit: "edit",
  write: "edit",
  editfiles: "edit",
  createfile: "edit",
  applypatch: "edit",
  bash: "shell",
  shell: "shell",
  runcommands: "shell",
  runinterminal: "shell",
};

const READ_WORDS = new Set([
  "read",
  "view",
  "list",
  "search",
  "find",
  "get",
  "inspect",
  "usage",
  "usages",
  "problem",
  "problems",
  "change",
  "changes",
  "diff",
  "fetch",
  "browse",
  "think",
  "todo",
  "todos",
  "codebase",
  "grep",
  "glob",
  "symbol",
  "symbols",
]);
const EDIT_WORDS = new Set([
  "edit",
  "write",
  "create",
  "apply",
  "patch",
  "insert",
  "replace",
  "delete",
  "remove",
  "rename",
  "move",
]);
const SHELL_WORDS = new Set([
  "run",
  "exec",
  "execute",
  "terminal",
  "command",
  "commands",
  "shell",
  "bash",
  "powershell",
  "task",
  "tasks",
  "process",
  "install",
]);

/** Split editFiles / run_in_terminal / read-file into lowercase words. */
export function tokenize(name) {
  return String(name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

export function classifyTool(rawName) {
  const name = String(rawName ?? "");
  const explicit = EXPLICIT_KINDS[name.toLowerCase()];
  if (explicit) return explicit;
  if (!name) return "unknown";

  const words = tokenize(name);
  // Order matters: a name like "runTests" both executes and reads, and the
  // execute reading is the one with consequences.
  if (words.some((word) => SHELL_WORDS.has(word))) return "shell";
  if (words.some((word) => EDIT_WORDS.has(word))) return "edit";
  if (words.some((word) => READ_WORDS.has(word))) return "read";
  return "unknown";
}

export function normalizeToolCall(call) {
  const rawName = String(call?.toolName ?? call?.tool_name ?? "");
  let args = call?.toolArgs ?? call?.tool_input ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      if (args.startsWith("*** Begin Patch")) args = { patch: args };
      else throw new Error("Tool arguments must be a supported JSON object or patch envelope.");
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Tool arguments must be an object.");
  }

  const paths = [];
  for (const key of ["path", "file", "filePath", "file_path", "uri", "oldPath", "newPath", "destination"]) {
    if (typeof args[key] === "string") paths.push(args[key]);
  }
  if (Array.isArray(args.files)) {
    for (const entry of args.files) {
      if (typeof entry === "string") paths.push(entry);
      else if (entry && typeof entry.path === "string") paths.push(entry.path);
      else throw new Error("A multi-file edit contains an unsupported path entry.");
    }
  }
  for (const key of ["edits", "replacements"]) {
    if (!Array.isArray(args[key])) continue;
    for (const entry of args[key]) {
      const target = entry?.filePath ?? entry?.file_path ?? entry?.path;
      if (typeof target !== "string") throw new Error("A multi-edit entry has no supported path.");
      paths.push(target);
    }
  }
  const patch = args.patch ?? args.input;
  if (patch !== undefined) {
    if (typeof patch !== "string" || !patch.startsWith("*** Begin Patch\n") ||
        !patch.trimEnd().endsWith("*** End Patch")) {
      throw new Error("Unrecognized patch format; no edit paths were authorized.");
    }
    const targets = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)];
    if (!targets.length) throw new Error("The patch contains no explicit file paths.");
    paths.push(...targets.map((match) => match[1]));
  }

  return {
    rawName,
    kind: classifyTool(rawName),
    paths,
    command: String(args.command ?? args.commandLine ?? "").trim(),
  };
}

/**
 * @param {{toolName?: string, tool_name?: string, toolArgs?: Record<string, unknown>, tool_input?: Record<string, unknown>}} call
 * @param {{
 *   scope?: {allowed: string[]}, taskId?: string, issue?: number,
 *   sessionId?: string, workspaceOwnerMatches?: boolean,
 *   trustedContract?: boolean, approvedPlan?: boolean, validPlan?: boolean,
 *   requirePlanApproval?: boolean, branchAuthorized?: boolean, role?: string,
 *   canPropose?: boolean, planScope?: {allowed: string[]}, repoRoot?: string
 * }} [context]
 */
export function evaluateToolCall(call, context = {}) {
  let normalized;
  try {
    normalized = normalizeToolCall(call);
  } catch (error) {
    return deny(error.message);
  }
  const { rawName, kind, command } = normalized;
  let { paths } = normalized;
  const governed = Boolean(context.taskId);
  const trusted = context.trustedContract === true;
  const approved = context.approvedPlan === true;
  const proposedExecution = context.validPlan === true &&
    context.requirePlanApproval === false;
  const canExecute = approved || proposedExecution;
  const branchAuthorized = context.branchAuthorized === true;
  const scope = context.scope ?? DEFAULT_SCOPE;
  const where = governed ? `the ${context.taskId} scope` : "the default scope";
  const canPropose = trusted && context.role === "implement" &&
    context.canPropose === true;

  // A dangerous string is dangerous whatever the tool claims to be, and whether
  // or not a task governs this session.
  if (command) {
    for (const { pattern, reason } of DENIED_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return deny(reason);
      }
    }
    if (SHELL_METACHARACTERS.test(command)) {
      return deny("shell chaining, redirection, interpolation, and pipelines are not allowlisted");
    }
  }

  if (kind === "read") {
    return allow("read-only tool");
  }

  if (kind === "edit") {
    if (context.role === "plan") return deny("The planner is read-only; publication uses an explicit human handoff.");
    if (!governed) {
      return deny(
        "no task contract is active; autonomous writes require precise inputs, outputs, and success criteria",
      );
    }
    if (!trusted) {
      return deny("the active task contract is not trusted GitHub issue authority");
    }
    if (canPropose) {
      try {
        const proposalPaths = paths.map((target) => normalizeEditPath(target, context.repoRoot));
        if (proposalPaths.length === 1 && proposalPaths[0] === "artifacts/plan-proposal.md") {
          return allow("the selected lower-risk session may propose a plan artifact, not edit source yet");
        }
      } catch (error) {
        return deny(error.message);
      }
    }
    if (!canExecute) {
      return deny("no human-approved machine-readable plan authorizes writes");
    }
    if (!branchAuthorized) {
      return deny("writes require the task's dedicated implementation branch");
    }
    if (paths.length === 0) {
      return ask(
        `"${rawName}" may write but named no path this policy can check`,
      );
    }
    try {
      paths = paths.map((target) => normalizeEditPath(target, context.repoRoot));
    } catch (error) {
      return deny(error.message);
    }

    // Prohibited beats allowed. A contract that says src/** but not src/api/**
    // means the second, and checking allowed first would let it through.
    const { paths: prohibitedPaths, advisory } = splitProhibitions(scope);
    for (const target of paths) {
      const hit = prohibitedPaths.find((pattern) =>
        matchesPattern(target, pattern),
      );
      if (hit) {
        return deny(
          `${normalize(target)} is prohibited by the contract (${hit})`,
        );
      }
    }

    const blocked = paths.filter((target) => {
      const normalized = normalize(target);
      return normalized.includes("..") || !isPathAllowed(normalized, scope);
    });
    const outsidePlan = paths.filter(
      (target) =>
        !context.planScope ||
        !isPathAllowed(normalize(target), context.planScope),
    );
    if (blocked.length === 0) {
      if (outsidePlan.length > 0) {
        return deny(
          `${outsidePlan.map(normalize).join(", ")} is outside the approved plan scope`,
        );
      }
      // Inside the allowed paths and not path-prohibited. Any remaining
      // prohibitions are stated in prose, which a path check cannot evaluate,
      // so say so rather than implying they were verified.
      return allow(
        advisory.length > 0
          ? `${paths.map(normalize).join(", ")} is inside ${where}; not checked against the contract's prose prohibitions (${advisory.join("; ")})`
          : `${paths.map(normalize).join(", ")} is inside ${where}`,
      );
    }
    // Outside the scope. If a task governs this session that is a real
    // violation. If none does, there is no contract to violate, so ask instead
    // of enforcing a boundary nobody agreed to.
    return deny(
      `${blocked.map(normalize).join(", ")} is outside ${where} (${scope.allowed.join(", ") || "no writable paths"})`,
    );
  }

  if (kind === "shell") {
    if (!command) {
      return ask(
        `"${rawName}" may execute but named no command this policy can check`,
      );
    }
    const contractFetch =
      /^npm run contract:fetch -- --issue ([1-9]\d*)(?: --session-id ([A-Za-z0-9._-]+))?$/.exec(command);
    if (contractFetch) {
      if (typeof context.sessionId !== "string" || !context.sessionId.trim() ||
          (contractFetch[2] && contractFetch[2] !== context.sessionId) ||
          (context.issue && Number(contractFetch[1]) !== context.issue)) {
        return deny("task contract bootstrap must use the current explicit issue and session identity");
      }
      return allow("resolve the explicit task under the current session identity; the owner check precedes cache changes");
    }
    const materializeProposal =
      /^npm run plan:materialize -- --file artifacts\/plan-proposal\.md --execute-proposed --session-id ([A-Za-z0-9._-]+)$/.exec(command);
    if (canPropose && materializeProposal) {
      if (materializeProposal[1] !== context.sessionId) {
        return deny("plan materialization must use the current task session identity");
      }
      return allow("validate the exact lower-risk proposal against the live task and isolated base");
    }
    const workspaceRelease =
      /^npm run workspace:release -- --issue ([1-9]\d*) --session-id ([A-Za-z0-9._-]+)( --clear-unowned)?$/.exec(command);
    if (workspaceRelease) {
      if (workspaceRelease[3]) {
        if (workspaceRelease[2] !== context.sessionId ||
            context.workspaceOwnerMatches === true) {
          return deny("orphaned task cleanup requires the current session and no active workspace owner");
        }
        return ask(
          "this explicit recovery removes unowned task authority caches; verify they are obsolete before cleanup",
        );
      }
      if (context.role === "plan" || !trusted || !canExecute || !branchAuthorized ||
          Number(workspaceRelease[1]) !== context.issue ||
          workspaceRelease[2] !== context.sessionId ||
          context.workspaceOwnerMatches !== true) {
        return deny("workspace release must match the approved task, current session, and owned workspace");
      }
      return allow("release only the current session's owned task workspace");
    }
    const workspacePreparation =
      /^npm run workspace:prepare -- --issue ([1-9]\d*) --path (\S+) --session-id ([A-Za-z0-9._-]+)$/.exec(command);
    if (workspacePreparation) {
      if (context.role === "plan" || !trusted || !canExecute || !branchAuthorized) {
        return deny("workspace preparation requires a trusted task, approved plan, and dedicated implementation branch");
      }
      if (Number(workspacePreparation[1]) !== context.issue ||
          workspacePreparation[3] !== context.sessionId ||
          context.workspaceOwnerMatches !== true) {
        return deny("workspace preparation must match the current task issue, session, and owned workspace");
      }
      return allow("prepare a new dedicated worktree from the approved immutable base without switching this checkout");
    }
    if (ALLOWED_COMMANDS.some((pattern) => pattern.test(command))) {
      if (
        /^npm run plan:show\b/.test(command) ||
        /^git (status|diff|log)\b/.test(command)
      ) {
        return allow("command is in the validation allowlist");
      }
      if (context.role === "plan") return deny("The planner cannot execute validation or implementation commands.");
      if (!trusted) {
        return deny("the active task contract is not trusted GitHub issue authority");
      }
      if (!canExecute) {
        return deny("no human-approved machine-readable plan authorizes execution");
      }
      if (!branchAuthorized) {
        return deny("execution requires the task's dedicated implementation branch");
      }
      if (command.startsWith("npm run test:unit -- ")) {
        const selectors = command.slice("npm run test:unit -- ".length).split(" ");
        if (selectors.some((target) => target.includes("..") ||
            !isPathAllowed(target, scope) || !context.planScope ||
            !isPathAllowed(target, context.planScope))) {
          return deny("A targeted test selector is outside the task or plan scope.");
        }
      }
      return allow("command is in the approved validation allowlist");
    }
    const environment = ENVIRONMENT_COMMANDS.find(({ pattern }) =>
      pattern.test(command),
    );
    if (environment) {
      if (context.role === "plan" || !trusted || !canExecute || !branchAuthorized) {
        return deny(
          "environment preparation requires a trusted task contract, approved plan, and dedicated implementation branch",
        );
      }
      return ask(
        `"${command}" ${environment.action}. Preparing the environment is a human decision, ` +
          "not part of the task scope, but the acceptance evidence cannot be produced without it.",
      );
    }
    return deny(
      governed
        ? "command is not in the validation allowlist"
        : "command is not authorized because no task contract is active",
    );
  }

  // Unknown capability. Do not guess in either direction: let the human decide,
  // and the reason names the tool so the policy can learn it.
  return governed
    ? ask(`"${rawName}" is not a tool this policy recognizes`)
    : deny(`"${rawName}" is not authorized because no task contract is active`);
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Extract the tool call from whatever the shell delivered.
 *
 * Shells add noise. A bash line continuation (`\`) pasted into PowerShell
 * arrives as an extra argument, so stdin ends up holding the JSON object
 * followed by a stray `\` line. Accept only that known suffix in addition to
 * clean JSON; arbitrary prefixes, suffixes, or multiple objects remain invalid.
 *
 * @param {string} raw
 * @returns {{ok: true, value: unknown} | {ok: false, reason: string}}
 */
export function parsePayload(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    // Never block on an empty payload. If the host did not deliver stdin - a
    // wrapper script swallowing it, a shell quoting problem, an event that
    // sends nothing - denying would stop the agent on every single call and the
    // hook would be switched off. Ask instead, and say what to check.
    return {
      ok: false,
      decision: ask(
        "the hook received no tool call on stdin, so this call could not be evaluated. " +
          "Check that the hook command runs `node scripts/authorize-tool.mjs` directly rather than through a shell wrapper.",
      ),
    };
  }

  try {
    const value = JSON.parse(text.replace(/\r?\n\\$/, ""));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("A tool call must be an object.");
    }
    return { ok: true, value };
  } catch {
    // A malformed envelope is not permission to select a convenient inner object.
  }

  return {
    ok: false,
    decision: deny(
      'Tool call payload was not valid JSON; raw input is intentionally omitted. Check the host envelope and shell line continuation.',
    ),
  };
}

/**
 * Emit a decision both hosts understand.
 *
 * Copilot cloud agent and CLI read the flat fields. VS Code reads
 * `hookSpecificOutput`. Writing both keeps one script for both harnesses;
 * each host ignores the shape it does not know.
 */
export function renderDecision(decision) {
  return {
    ...decision,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision.permissionDecision,
      permissionDecisionReason: decision.permissionDecisionReason,
    },
  };
}

async function main() {
  const parsed = parsePayload(await readStdin());
  let decision;
  if (!parsed.ok) {
    decision = parsed.decision;
  } else {
    try {
      const contract = loadTaskContract();
      let plan = null;
      try {
        plan = JSON.parse(
          readFileSync(resolve(REPO_ROOT, "artifacts/plan.json"), "utf8"),
        );
      } catch {
        plan = null;
      }
      const validation = validatePlanContract(plan, contract);
      const approvedPlan =
        validation.ok &&
        Boolean(contract?.source?.trusted) &&
        plan?.schema === "northstar/plan/1" &&
        plan?.taskId === contract?.id &&
        plan?.contractDigest === contract?.source?.bodyDigest &&
        (
          plan?.approval?.schema === "northstar/plan-approval/1" ||
          (
            plan?.approval?.schema === "northstar/plan-approval/2" &&
            plan.approval.source === "github-review" &&
            plan.approval.artifactPath === planArtifactPath(contract.id) &&
            /^[0-9a-f]{40}$/.test(plan.approval.artifactBlobSha)
          )
        ) &&
        plan?.approval?.taskId === contract?.id &&
        plan?.approval?.contractDigest === contract?.source?.bodyDigest &&
        plan?.approval?.planDigest === plan?.planDigest &&
        plan?.planDigest === planDigest(plan);
      let branch = null;
      let headSha = null;
      let descendsFromApprovedBase = false;
      try {
        branch = execFileSync("git", ["branch", "--show-current"], {
          cwd: REPO_ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        headSha = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (plan?.baseSha) {
          execFileSync(
            "git",
            ["merge-base", "--is-ancestor", plan.baseSha, "HEAD"],
            {
              cwd: REPO_ROOT,
              stdio: ["ignore", "ignore", "ignore"],
            },
          );
          descendsFromApprovedBase = true;
        }
      } catch {
        descendsFromApprovedBase = false;
      }
      let branchAuthorized =
        branch === `agent/implement/${String(contract?.id ?? "").toLowerCase()}` &&
        descendsFromApprovedBase;
      if (!branchAuthorized && process.env.COPILOT_AGENT_PROMPT) {
        let cloudContext = null;
        try {
          cloudContext = JSON.parse(readFileSync(resolve(REPO_ROOT, "artifacts/execution-context.json"), "utf8"));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        branchAuthorized = cloudContext?.schema === "northstar/execution-context/1" &&
          cloudContext.host === "cloud" && cloudContext.branch === branch &&
          cloudContext.headSha === headSha && cloudContext.baseSha === plan?.baseSha &&
          cloudContext.taskId === contract?.id &&
          cloudContext.contractDigest === contract?.source?.bodyDigest &&
          cloudContext.planDigest === plan?.planDigest && descendsFromApprovedBase;
      }
      let session = null;
      try {
        session = JSON.parse(readFileSync(resolve(REPO_ROOT, "artifacts/task-session.json"), "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const sessionId = parsed.value?.session_id ?? parsed.value?.sessionId;
      const workspaceOwner = readWorkspaceOwner(REPO_ROOT);
      let workspaceOwnerMatches = false;
      if (workspaceOwner && typeof sessionId === "string" && sessionId.trim() &&
          contract?.source?.trusted === true) {
        const expectedOwner = workspaceOwnerIdentity({
          root: REPO_ROOT,
          issue: contract.source.issue,
          taskId: contract.id,
          contractDigest: contract.source.bodyDigest,
          sessionId,
          env: process.env,
          contract,
        });
        const currentOwner = assertWorkspaceOwner(REPO_ROOT, expectedOwner);
        workspaceOwnerMatches = currentOwner?.ownerKey === workspaceOwner.ownerKey &&
          currentOwner.taskId === contract.id &&
          currentOwner.contractDigest === contract.source.bodyDigest;
      }
      const sessionMatches = workspaceOwnerMatches && Boolean(sessionId) && (
        session?.sessionId === sessionId && session?.taskId === contract?.id &&
        session?.contractDigest === contract?.source?.bodyDigest &&
        session?.workspaceOwner === workspaceOwner?.ownerKey
      );
      decision = evaluateToolCall(parsed.value, {
        scope: taskScope(contract),
        taskId: contract?.id,
        issue: contract?.source?.issue,
        sessionId,
        workspaceOwnerMatches,
        trustedContract: contract?.source?.trusted === true && sessionMatches,
        approvedPlan,
        validPlan: validation.ok,
        requirePlanApproval: validation.ok ? approvalPolicyForRisk(plan.risk).requirePlanOnlyApproval : true,
        role: session?.role ?? null,
        canPropose: session?.canPropose === true &&
          session?.workflow === "plan-and-execute" &&
          session?.taskId === contract?.id &&
          session?.contractDigest === contract?.source?.bodyDigest &&
          session?.workspaceHead === headSha &&
          branch === `agent/implement/${String(contract?.id ?? "").toLowerCase()}`,
        branchAuthorized,
        planScope: plan?.scope,
        repoRoot: REPO_ROOT,
      });
    } catch (error) {
      decision = deny(/** @type {Error} */ (error).message);
    }
  }
  process.stdout.write(
    `${JSON.stringify(renderDecision(decision), null, 2)}\n`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
