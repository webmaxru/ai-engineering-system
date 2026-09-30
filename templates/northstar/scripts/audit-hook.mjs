import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CONTRACT_CACHE } from "./task-contract.mjs";
import { evidencePath } from "./evidence-record.mjs";
import { readWorkspaceOwner, workspaceOwnerIdentity } from "./workspace-owner.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function hash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function readJsonIfPresent(root, path) {
  try {
    return JSON.parse(readFileSync(resolve(root, path), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Audit context ${path} is malformed or unreadable: ${error.message}`, { cause: error });
  }
}

function ownedTask(root, sessionId, env) {
  const owner = readWorkspaceOwner(root);
  if (!owner || owner.issue === null ||
      typeof sessionId !== "string" || !sessionId.trim()) return null;
  const identity = workspaceOwnerIdentity({
    root,
    issue: owner.issue,
    sessionId,
    env: { ...env, GITHUB_REPOSITORY: owner.repository },
  });
  if (identity.ownerKey !== owner.ownerKey) return null;

  const session = readJsonIfPresent(root, "artifacts/task-session.json");
  const contract = readJsonIfPresent(root, CONTRACT_CACHE);
  if (!session || !contract ||
      session.workspaceOwner !== owner.ownerKey ||
      session.sessionId !== sessionId ||
      session.issue !== owner.issue ||
      session.taskId !== owner.taskId ||
      session.contractDigest !== owner.contractDigest ||
      contract.source?.trusted !== true ||
      contract.source?.issue !== owner.issue ||
      contract.source?.url !== `https://github.com/${owner.repository}/issues/${owner.issue}` ||
      contract.id !== owner.taskId ||
      contract.source?.bodyDigest !== owner.contractDigest) return null;
  return { owner, contract };
}

function ownedPlanDigest(root, owner) {
  const plan = readJsonIfPresent(root, "artifacts/plan.json");
  if (plan?.taskId !== owner.taskId ||
      plan?.contractDigest !== owner.contractDigest ||
      !/^[0-9a-f]{64}$/.test(plan?.planDigest ?? "")) {
    return null;
  }
  return plan.planDigest;
}

function pathsFrom(args) {
  const paths = [];
  for (const key of ["path", "file", "filePath", "uri"]) {
    if (typeof args?.[key] === "string") paths.push(args[key]);
  }
  if (Array.isArray(args?.files)) {
    for (const file of args.files) {
      if (typeof file === "string") paths.push(file);
      else if (typeof file?.path === "string") paths.push(file.path);
    }
  }
  return paths.map((path) => String(path).replace(/\\/g, "/"));
}

export function createAuditRecord(
  payload,
  now = new Date().toISOString(),
  root = REPO_ROOT,
  env = process.env,
) {
  const sessionId = payload.sessionId ?? payload.session_id ?? null;
  const active = ownedTask(root, sessionId, env);
  const args = payload.toolArgs ?? payload.tool_input ?? {};
  const toolName = payload.toolName ?? payload.tool_name ?? null;
  const command = args.command ?? args.commandLine ?? null;
  const result = payload.toolResult ?? payload.tool_result ?? payload.result ?? null;
  const event = payload.hookEventName ?? payload.hook_event_name ?? "unknown";
  const resultType = result?.resultType ?? result?.result_type;
  const failed = /failure|error/i.test(event) || payload.parseError === true ||
    payload.success === false || payload.tool_success === false ||
    payload.error !== undefined || payload.tool_error !== undefined ||
    (resultType !== undefined && resultType !== "success");
  return {
    schema: "northstar/agent-audit/1",
    id: randomUUID(),
    timestamp: payload.timestamp ?? now,
    event,
    sessionId,
    taskId: active?.contract.id ?? null,
    contractDigest: active?.contract.source?.bodyDigest ?? null,
    planDigest: active ? ownedPlanDigest(root, active.owner) : null,
    workspaceOwnerVerified: Boolean(active),
    tool: toolName,
    paths: pathsFrom(args),
    commandDigest: command ? hash(command) : null,
    argumentsDigest: hash(JSON.stringify(args)),
    resultDigest: result === null ? null : hash(JSON.stringify(result)),
    success: failed ? false :
      payload.success === true || payload.tool_success === true ||
      resultType === "success" || /^(postToolUse|PostToolUse)$/.test(event) ? true : null,
  };
}

export function writeAuditRecord(record, out = null, root = REPO_ROOT) {
  if (!out && (typeof record.sessionId !== "string" || !record.sessionId.trim())) {
    throw new Error("Session-scoped audit output requires an explicit session identity.");
  }
  const sessionPath = out ?? `artifacts/agent-audit/${hash(record.sessionId).slice(0, 24)}.jsonl`;
  const target = evidencePath(sessionPath, root);
  mkdirSync(dirname(target), { recursive: true });
  appendFileSync(target, `${JSON.stringify(record)}\n`, "utf8");
  return target;
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { parseError: true };
    process.stderr.write("Audit hook received malformed JSON; recorded failure without retaining raw input.\n");
  }
  writeAuditRecord(createAuditRecord(payload));
  process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
