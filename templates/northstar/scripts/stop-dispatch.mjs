import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = resolve(import.meta.dirname, "..");

export function selectStopHandler(session, payload) {
  if (!session || !["plan", "implement"].includes(session.role)) return null;
  const sessionId = payload.session_id ?? payload.sessionId ?? null;
  if (session.sessionId && session.sessionId !== sessionId) {
    throw new Error("The Stop event does not match the task session.");
  }
  return session.role === "plan" ? "plan-stop.mjs" : "agent-stop.mjs";
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  let payload;
  let session;
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid Stop envelope.");
    try {
      session = JSON.parse(readFileSync(resolve(REPO_ROOT, "artifacts/task-session.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const handler = selectStopHandler(session, payload);
    if (!handler) {
      process.stdout.write('{"continue":true}\n');
      return;
    }
    const result = spawnSync(process.execPath, [resolve(REPO_ROOT, "scripts", handler)], {
      cwd: REPO_ROOT, input: JSON.stringify(payload), encoding: "utf8",
      timeout: 290_000, maxBuffer: 4 * 1024 * 1024,
    });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error || result.status !== 0) {
      throw new Error(`The ${session.role} Stop handler failed; no successful completion is established.`);
    }
    const output = JSON.parse(result.stdout);
    if (!output.decision && output.hookSpecificOutput?.hookEventName === "Stop" &&
        output.hookSpecificOutput.decision === "block") {
      output.decision = "block";
      output.reason = output.hookSpecificOutput.reason;
    }
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stdout.write(`${JSON.stringify({
      decision: payload?.stop_hook_active ? undefined : "block",
      reason: `Stop evaluation failed: ${error.message} Escalate; do not claim readiness.`,
      systemMessage: "Human intervention is required; stop retrying this failed hook.",
    })}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
