/**
 * Close the loop when the implementer stops.
 *
 * Wired to the Stop hook on the implement agent. Running the suites and
 * building the evidence report by hand after every agent turn is ceremony: the
 * agent claims done, and a human types four commands to find out whether that
 * was true. The system can do that itself, and refuse the claim when the
 * evidence does not support it.
 *
 * Behaviour:
 *   - runs the unit and acceptance suites, then the execution report
 *   - if the report says ready_for_review, let the agent stop and summarize
 *   - if a criterion is unproven or evidence is missing, block the stop and
 *     hand the agent the specific gap, so it keeps working
 *   - if the failure is environmental, do not block: that is not the agent's
 *     to fix, and looping on it would burn credits
 *
 * Loop safety: `stop_hook_active` is set when the agent is already continuing
 * because of a previous stop hook. It is never blocked twice.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import {
  createCheckRecord,
  writeCheckRecord,
} from "./evidence-record.mjs";
import { classify } from "./repair-budget.mjs";
import { loadTaskContract } from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function run(command) {
  try {
    const stdout = execSync(command, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, output: stdout };
  } catch (error) {
    const detail = `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim();
    return { ok: false, output: detail || error.message };
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function report() {
  try {
    return JSON.parse(readFileSync(resolve(REPO_ROOT, "artifacts/report.json"), "utf8"));
  } catch {
    return null;
  }
}

function record(id, result, artifact, category = "execution") {
  writeCheckRecord(
    createCheckRecord({
      id,
      category,
      status: result.ok ? "pass" : "fail",
      artifact,
    }),
  );
}

export function summarize(data) {
  if (!data) return "no execution report was produced";
  const proven = data.successCriteria.filter((c) => c.proven).length;
  return [
    `${data.decision}`,
    `criteria ${proven}/${data.successCriteria.length}`,
    `unit ${data.tests.unit.tests ?? 0} tests, ${(data.tests.unit.failures ?? 0) + (data.tests.unit.errors ?? 0)} failed`,
    `acceptance ${data.tests.acceptance.tests ?? 0} tests, ${(data.tests.acceptance.failures ?? 0) + (data.tests.acceptance.errors ?? 0)} failed`,
  ].join(" | ");
}

async function main() {
  const raw = (await readStdin()).trim();
  let input;
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    input = {};
  }

  // Never block twice. The agent is already continuing because of this hook.
  if (input.stop_hook_active) {
    emit({ systemMessage: "Evidence gate already ran this turn; not blocking again." });
    return;
  }

  if (!loadTaskContract()) {
    emit({
      systemMessage:
        "No task contract is active, so the evidence gate did not run. Nothing was verified.",
    });
    return;
  }

  let plan;
  try {
    plan = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "artifacts/plan.json"), "utf8"),
    );
  } catch {
    emit({
      hookSpecificOutput: {
        hookEventName: "Stop",
        decision: "block",
        reason:
          "Do not stop yet. artifacts/plan.json is absent, so no approved machine-readable plan governs implementation.",
      },
      systemMessage: "Evidence gate blocked the stop: approved plan missing.",
    });
    return;
  }

  record("plan-contract", { ok: true }, "artifacts/plan.json", "policy");
  const quality = run(
    "npm run instructions:check && npm run lint && npm run typecheck && npm run build && npm run test:unit:ci",
  );
  record("quality", quality, "artifacts/unit-junit.xml");
  const acceptance = run("npm run test:acceptance:ci");
  record("acceptance", acceptance, "artifacts/acceptance-junit.xml");
  const dependency = run(
    "npm audit --audit-level=high --json > artifacts/dependency-audit.json",
  );
  record(
    "dependency-review",
    dependency,
    "artifacts/dependency-audit.json",
    "security",
  );
  const secret = run("npm run security:secrets");
  record("secret-scan", secret, null, "security");
  const governance = run("npm run governance:check");
  record(
    "governance-policy",
    governance,
    "artifacts/governance-report.json",
    "policy",
  );
  const scope = run(`npm run scope:check -- --base ${plan.baseSha}`);
  record("scope-policy", scope, "artifacts/scope-report.json", "policy");
  const merge = run(`node scripts/check-merge.mjs --base ${plan.baseSha}`);
  record(
    "merge-validation",
    merge,
    "artifacts/merge-report.json",
    "policy",
  );
  run("npm run evidence");
  const data = report();

  // An environment failure is not the agent's to repair, and blocking on it
  // would spend turns on a database that is simply not running.
  const combined = `${quality.output}\n${acceptance.output}`;
  const layer = classify(combined).layer;
  const acceptanceEnvironmentFailure =
    !acceptance.ok && layer === "environment";

  if (
    data?.decision === "ready_for_review" ||
    data?.decision === "ready_for_acceptance"
  ) {
    emit({
      systemMessage: `Evidence gate passed: ${summarize(data)}. Report at artifacts/report.json.`,
    });
    return;
  }

  const gaps = [];
  if (data?.failedLocalChecks?.length) gaps.push(`failed local checks: ${data.failedLocalChecks.join(", ")}`);
  if (data?.unprovenCriteria?.length) gaps.push(`unproven criteria: ${data.unprovenCriteria.join(", ")}`);
  if (!quality.ok) gaps.push("quality suite failed");
  if (acceptanceEnvironmentFailure) {
    gaps.push(
      "acceptance environment unavailable; start PostgreSQL and rerun before completion",
    );
  } else if (!acceptance.ok) {
    gaps.push("acceptance suite failed");
  }
  if (!dependency.ok) gaps.push("dependency audit failed");
  if (!secret.ok) gaps.push("secret scan failed");
  if (!governance.ok) gaps.push("governance audit failed");
  if (!scope.ok) gaps.push("scope policy failed");
  if (!merge.ok) gaps.push("merge validation failed");
  if (gaps.length === 0) gaps.push("the execution report did not reach ready_for_review");

  emit({
    hookSpecificOutput: {
      hookEventName: "Stop",
      decision: "block",
      reason:
        `Do not stop yet. The evidence does not support "done": ${gaps.join("; ")}. ` +
        "Fix the gap, do not weaken a test, and do not claim completion the report cannot show. " +
        "If the failure is a permission or policy problem, stop and escalate instead.",
    },
    systemMessage: `Evidence gate blocked the stop: ${summarize(data)}`,
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
