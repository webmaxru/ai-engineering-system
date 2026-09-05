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

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const MAX_ATTEMPTS = 3;

/**
 * Reduce a raw failure to a stable signature. Run ids, timings, temp paths, and
 * memory addresses change on every attempt and would make every failure look
 * new, which is how an agent talks itself into looping.
 */
export function failureSignature({ check, message }) {
  const normalized = String(message ?? "")
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, "<addr>")
    .replace(/\b[0-9a-f]{7,40}\b/g, "<sha>")
    .replace(/\b\d+(\.\d+)?\s?(ms|s|sec|seconds)\b/g, "<duration>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/[\\/][^\s'"]*[\\/][^\s'"]*/g, "<path>")
    .replace(/\s+/g, " ")
    .trim();

  return `${check}:${createHash("sha1").update(normalized).digest("hex").slice(0, 12)}`;
}

/** Layers from the deck's failure taxonomy, mapped to what actually changes. */
export function classify(message) {
  const text = String(message ?? "").toLowerCase();
  if (/permission|forbidden|denied|eacces|401|403/.test(text)) {
    return { layer: "policy", action: "escalate", change: "adjust authority, not the prompt" };
  }
  if (/codeql|secret scan|credential|vulnerab|cve-|ghsa-|injection/.test(text)) {
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
  if (/econnrefused|etimedout|enotfound|socket hang up/.test(text)) {
    return { layer: "environment", action: "repair", change: "fix the bootstrap so the dependency is present" };
  }
  if (/cannot find module|is not exported|type '.*' is not assignable|ts\d{4}/.test(text)) {
    return { layer: "context", action: "repair", change: "retrieve the missing source of truth" };
  }
  if (/expected .* received|assertion|to be|toequal/.test(text)) {
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
  const history = attempts.map((attempt) => ({
    ...attempt,
    signature: failureSignature(attempt),
    ...classify(attempt.message),
  }));

  const latest = history.at(-1);
  if (!latest) {
    return { decision: "proceed", reason: "no failures recorded", history };
  }

  const repeats = history.filter((entry) => entry.signature === latest.signature).length;

  if (latest.action === "escalate") {
    return {
      decision: "escalate",
      reason: `${latest.layer} failure: ${latest.change}`,
      signature: latest.signature,
      repeats,
      history,
    };
  }

  if (repeats >= 2) {
    return {
      decision: "escalate",
      reason: `the same ${latest.check} failure signature occurred ${repeats} times; another attempt is not recovery`,
      signature: latest.signature,
      repeats,
      history,
    };
  }

  if (history.length >= MAX_ATTEMPTS) {
    return {
      decision: "escalate",
      reason: `attempt budget of ${MAX_ATTEMPTS} is exhausted`,
      signature: latest.signature,
      repeats,
      history,
    };
  }

  return {
    decision: "repair",
    reason: `${latest.layer} failure: ${latest.change}`,
    signature: latest.signature,
    repeats,
    remainingAttempts: MAX_ATTEMPTS - history.length,
    history,
  };
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const inputPath = process.argv[2] ?? "artifacts/attempts.json";
  if (!existsSync(inputPath)) {
    process.stdout.write(`no attempt log at ${inputPath}\n`);
    process.exit(0);
  }
  const result = decide(JSON.parse(readFileSync(inputPath, "utf8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.decision === "escalate") {
    process.exitCode = 1;
  }
}
