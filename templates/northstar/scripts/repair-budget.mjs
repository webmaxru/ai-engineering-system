/**
 * Bounded repair budget.
 *
 * Retrying is not recovery. This module decides whether another automated
 * attempt is legitimate by looking at the failure signature rather than the
 * attempt count alone. The rule is the one in AGENTS.md and ADR-007: when the
 * same required check fails twice with the same signature, the loop stops and a
 * human decides.
 *
 * Usage: node scripts/repair-budget.mjs artifacts/attempts.json
 */

import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evidencePath, readEvidenceJson } from "./evidence-record.mjs";

export const MAX_ATTEMPTS = 3;
const REPO_ROOT = resolve(import.meta.dirname, "..");

/**
 * Reduce a raw failure to a stable signature. Run ids, timings, temp paths, and
 * memory addresses change on every attempt and would make every failure look
 * new, which is how an agent talks itself into looping.
 */
export function failureSignature({ check, message }) {
  const normalized = String(message ?? "")
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, "<addr>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/g, "<id>")
    .replace(/\b[0-9a-f]{7,64}\b/g, "<sha>")
    .replace(/\b\d+(\.\d+)?\s?(ms|s|sec|seconds)\b/g, "<duration>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/(?:[a-z]:)?[\\/][^\s'"]*[\\/][^\s'"]*/g, "<path>")
    .replace(/\s+/g, " ")
    .trim();

  return `${check}:${createHash("sha1").update(normalized).digest("hex").slice(0, 12)}`;
}

/** Layers from the deck's failure taxonomy, mapped to what actually changes. */
export function classify(message) {
  const text = String(message ?? "").toLowerCase();
  if (/permission|forbidden|denied|eacces|\b(?:401|403)\b|\bpolicy (?:failure|violation|blocked|denied)\b|unapproved/.test(text)) {
    return { layer: "policy", action: "escalate", change: "adjust authority, not the prompt" };
  }
  if (/codeql|secret.?scan|credential|vulnerab|cve-|ghsa-|injection/.test(text)) {
    return {
      layer: "security",
      action: "escalate",
      change: "investigate the security condition; do not retry it away",
    };
  }
  if (/merge conflict|conflict in|both modified|cannot merge/.test(text)) {
    return {
      layer: "conflict",
      action: "repair",
      change: "reconcile against the authoritative issue, PR, and current base",
    };
  }
  if (/econnrefused|etimedout|enotfound|socket hang up|connection timeout|service unavailable/.test(text)) {
    return { layer: "environment", action: "repair", change: "fix the bootstrap so the dependency is present" };
  }
  if (/cannot find module|is not exported|type '.*' is not assignable|ts\d{4}|stale|missing.*(?:artifact|source|plan|report)|(?:artifact|source|plan|report).*(?:missing|unavailable|mismatch|dirty|malformed)|digest mismatch/.test(text)) {
    return { layer: "context", action: "repair", change: "retrieve the missing source of truth" };
  }
  if (/expected .* received|assertion|to be|toequal|unproven criteria/.test(text)) {
    return { layer: "reasoning", action: "repair", change: "revise the plan, not the assertion" };
  }
  if (/command not found|unknown option|invalid argument|tool .* failed/.test(text)) {
    return {
      layer: "tool",
      action: "repair",
      change: "correct the tool invocation or workflow configuration",
    };
  }
  return { layer: "unknown", action: "escalate", change: "classify before spending another attempt" };
}

/**
 * @param {Array<{check: string, message: string}>} attempts ordered oldest first
 */
export function decide(attempts) {
  const history = attempts.map((attempt, index) => ({
    ...attempt,
    attempt: index + 1,
    signature: failureSignature(attempt),
    ...classify(attempt.message),
  }));
  return decideHistory(history, attempts.length, attempts.length === 0);
}

function decideHistory(history, spent, passed) {
  const latest = history.at(-1);
  if (!latest) {
    return { decision: "proceed", reason: "no failures recorded", history, remainingAttempts: MAX_ATTEMPTS - spent };
  }
  const counts = new Map(history.map((entry) => [entry.signature,
    new Set(history.filter((candidate) => candidate.signature === entry.signature).map(({ attempt }) => attempt)).size,
  ]));
  const blocking = history.find(({ action }) => action === "escalate");
  if (blocking) {
    return {
      decision: "escalate",
      reason: `${blocking.layer} failure: ${blocking.change}`,
      signature: blocking.signature,
      repeats: counts.get(blocking.signature),
      history,
    };
  }
  const repeated = history.find((entry) => counts.get(entry.signature) >= 2);
  if (repeated) {
    return {
      decision: "escalate",
      reason: `the same ${repeated.check} failure signature occurred ${counts.get(repeated.signature)} times; another attempt is not recovery`,
      signature: repeated.signature,
      repeats: counts.get(repeated.signature),
      history,
    };
  }
  const environmental = history.filter(({ layer }) => layer === "environment");
  if (new Set(environmental.map(({ attempt }) => attempt)).size >= 2) {
    return { decision: "escalate", reason: "the single environment retry is exhausted", history };
  }
  if (passed) {
    return { decision: "proceed", reason: "current Stop evidence passed", history, remainingAttempts: MAX_ATTEMPTS - spent };
  }
  if (spent >= MAX_ATTEMPTS) {
    return {
      decision: "escalate",
      reason: `attempt budget of ${MAX_ATTEMPTS} is exhausted`,
      signature: latest.signature,
      repeats: counts.get(latest.signature),
      history,
    };
  }

  return {
    decision: "repair",
    reason: `${latest.layer} failure: ${latest.change}`,
    signature: latest.signature,
    repeats: counts.get(latest.signature),
    remainingAttempts: MAX_ATTEMPTS - spent,
    history,
  };
}

export function failureEvidence({ check, message }) {
  const classification = ["dependency-review", "secret-scan", "codeql"].includes(check)
    ? classify("security vulnerability")
    : ["plan-contract", "scope-policy", "governance-policy"].includes(check)
      ? classify("policy failure")
      : classify(message);
  return { check, signature: failureSignature({ check, message }), ...classification };
}

export function decideStopAttempts(attempts) {
  const history = attempts.flatMap((attempt, index) => attempt.failures.map((failure) => ({
    ...failure, attempt: index + 1,
  })));
  if (attempts.some(({ status }) => status === "running")) {
    return { decision: "escalate", reason: "an earlier Stop attempt was interrupted; reconcile its evidence before continuing", history };
  }
  return decideHistory(history, attempts.length, attempts.at(-1)?.status === "passed");
}

function writeState(path, state) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx" });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function validAttempts(attempts) {
  const layers = ["policy", "security", "environment", "tool", "context", "reasoning", "conflict", "unknown"];
  return Array.isArray(attempts) && attempts.length <= MAX_ATTEMPTS && attempts.every((attempt, index) =>
    attempt?.number === index + 1 && typeof attempt.id === "string" &&
    (attempt.sessionId === undefined || attempt.sessionId === null ||
      (typeof attempt.sessionId === "string" && attempt.sessionId.trim().length > 0)) &&
    /^[0-9a-f]{40}$/.test(attempt.headSha ?? "") &&
    Number.isFinite(Date.parse(attempt.startedAt)) &&
    ["running", "failed", "passed"].includes(attempt.status) &&
    (attempt.status === "running" || Number.isFinite(Date.parse(attempt.completedAt))) &&
    Array.isArray(attempt.failures) &&
    (attempt.status !== "failed" || attempt.failures.length > 0) &&
    (attempt.status !== "passed" || attempt.failures.length === 0) &&
    attempt.failures.every((failure) =>
      /^[a-z][a-z0-9-]*$/.test(failure.check ?? "") &&
      new RegExp(`^${failure.check}:[0-9a-f]{12}$`).test(failure.signature ?? "") &&
      layers.includes(failure.layer) &&
      failure.action === (["policy", "security", "unknown"].includes(failure.layer) ? "escalate" : "repair") &&
      typeof failure.change === "string"),
  );
}

export function runStopAttempt(scope, evaluate, { root = REPO_ROOT } = {}) {
  const identity = Object.fromEntries(
    ["repository", "taskId", "contractDigest", "planDigest", "baseSha", "sessionId"]
      .map((field) => [field, scope[field]]),
  );
  if (Object.values(identity).some((value) => typeof value !== "string" || !value) ||
    typeof scope.sessionId !== "string" || !scope.sessionId.trim() ||
    !/^[0-9a-f]{40}$/.test(scope.headSha ?? "")) {
    throw new Error("Stop recovery requires a complete task, plan, base, and source identity.");
  }
  const key = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  const path = evidencePath(`artifacts/stop-recovery/${key}.json`, root);
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lock;
  try {
    lock = openSync(lockPath, "wx");
  } catch (error) {
    throw new Error(`Stop recovery lock unavailable; another or interrupted attempt requires escalation (${error.code}).`, { cause: error });
  }
  try {
    const state = readEvidenceJson(path, root) ?? {
      schema: "northstar/stop-recovery/1", identity, attempts: [],
    };
    if (state.schema !== "northstar/stop-recovery/1" ||
      JSON.stringify(state.identity) !== JSON.stringify(identity) || !validAttempts(state.attempts)) {
      throw new Error("Malformed or mismatched Stop recovery history; automatic reset is prohibited.");
    }
    const previous = decideStopAttempts(state.attempts);
    if (previous.decision === "escalate" || state.attempts.length >= MAX_ATTEMPTS) {
      return {
        ...previous, decision: "escalate",
        reason: previous.decision === "escalate" ? previous.reason : `attempt budget of ${MAX_ATTEMPTS} is exhausted`,
        path, attempts: state.attempts, outcome: null,
      };
    }
    const attempt = {
      id: randomUUID(), number: state.attempts.length + 1, headSha: scope.headSha,
      sessionId: scope.sessionId ?? null,
      startedAt: new Date().toISOString(), completedAt: null,
      status: "running", failures: [], checks: [], reportPath: null, reportDigest: null,
    };
    state.attempts.push(attempt);
    writeState(path, state);
    let outcome;
    try {
      outcome = evaluate(attempt);
      if (!Array.isArray(outcome?.failures)) throw new Error("Stop evaluation did not return failure evidence.");
    } catch (error) {
      outcome = {
        failures: [failureEvidence({ check: "stop", message: error.message })],
        gaps: ["Stop evaluation failed before it could verify completion."],
      };
    }
    attempt.failures = outcome.failures;
    attempt.status = attempt.failures.length > 0 ? "failed" : "passed";
    attempt.completedAt = new Date().toISOString();
    attempt.checks = outcome.checks ?? [];
    attempt.reportPath = outcome.reportPath ?? null;
    attempt.reportDigest = outcome.reportDigest ?? null;
    if (!validAttempts(state.attempts)) throw new Error("Stop evaluation produced invalid recovery evidence.");
    writeState(path, state);
    return { ...decideStopAttempts(state.attempts), path, attempts: state.attempts, outcome };
  } finally {
    closeSync(lock);
    rmSync(lockPath);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const inputPath = process.argv[2] ?? "artifacts/attempts.json";
  if (!existsSync(inputPath)) {
    process.stderr.write(`No attempt log at ${inputPath}; no recovery decision was verified.\n`);
    process.exit(1);
  }
  try {
    const input = JSON.parse(readFileSync(inputPath, "utf8"));
    let result;
    if (input?.schema === "northstar/stop-recovery/1") {
      if (!validAttempts(input.attempts)) throw new Error("Malformed Stop recovery history.");
      result = decideStopAttempts(input.attempts);
    } else {
      result = decide(input);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.decision === "escalate") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Recovery evaluation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
