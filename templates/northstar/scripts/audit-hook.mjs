import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadTaskContract } from "./task-contract.mjs";

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

function planDigest() {
  try {
    const plan = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "artifacts/plan.json"), "utf8"),
    );
    return plan.planDigest ?? null;
  } catch {
    return null;
  }
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

export function createAuditRecord(payload, now = new Date().toISOString()) {
  const contract = loadTaskContract();
  const args = payload.toolArgs ?? payload.tool_input ?? {};
  const toolName = payload.toolName ?? payload.tool_name ?? null;
  const command = args.command ?? args.commandLine ?? null;
  const result = payload.toolResult ?? payload.tool_result ?? payload.result ?? null;
  return {
    schema: "northstar/agent-audit/1",
    id: randomUUID(),
    timestamp: payload.timestamp ?? now,
    event: payload.hookEventName ?? payload.hook_event_name ?? "unknown",
    sessionId: payload.sessionId ?? payload.session_id ?? null,
    taskId: contract?.id ?? null,
    contractDigest: contract?.source?.bodyDigest ?? null,
    planDigest: planDigest(),
    tool: toolName,
    paths: pathsFrom(args),
    commandDigest: command ? hash(command) : null,
    argumentsDigest: hash(JSON.stringify(args)),
    resultDigest: result === null ? null : hash(JSON.stringify(result)),
    success:
      payload.success ??
      payload.tool_success ??
      (payload.error === undefined && payload.tool_error === undefined),
  };
}

export function writeAuditRecord(record, out = "artifacts/agent-audit.jsonl") {
  const target = resolve(REPO_ROOT, out);
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
