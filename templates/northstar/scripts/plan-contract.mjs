import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  approvalPolicyForRisk,
  inferRisk,
  isRisk,
  requiredChecksForRisk,
  riskRank,
} from "./risk-policy.mjs";
import {
  loadTaskContract,
  matchesPattern,
} from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

export const PLAN_SCHEMA = "northstar/plan/1";
export const PLAN_CONTRACT_START = "<!-- northstar:plan-contract:start -->";
export const PLAN_CONTRACT_END = "<!-- northstar:plan-contract:end -->";

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["planDigest", "approval"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalPlan(plan) {
  return JSON.stringify(canonicalize(plan));
}

export function planDigest(plan) {
  return createHash("sha256").update(canonicalPlan(plan)).digest("hex");
}

export function extractPlanContract(markdown) {
  const text = String(markdown ?? "");
  const start = text.indexOf(PLAN_CONTRACT_START);
  if (start === -1) return null;
  const end = text.indexOf(PLAN_CONTRACT_END, start);
  if (end === -1) return null;

  const block = text.slice(start + PLAN_CONTRACT_START.length, end).trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(block);
  const json = fenced ? fenced[1] : block;
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(
      `The machine-readable plan contract is not valid JSON: ${/** @type {Error} */ (error).message}`,
      { cause: error },
    );
  }
}

export function renderPlanContract(plan) {
  return [
    PLAN_CONTRACT_START,
    "```json",
    JSON.stringify(plan, null, 2),
    "```",
    PLAN_CONTRACT_END,
  ].join("\n");
}

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function scopePatternWithin(planned, allowed) {
  if (planned === allowed) return true;
  if (!planned.includes("*")) return matchesPattern(planned, allowed);
  if (allowed.endsWith("/**")) {
    const prefix = allowed.slice(0, -3);
    const plannedPrefix = planned.split("*", 1)[0].replace(/\/+$/, "");
    return plannedPrefix === prefix || plannedPrefix.startsWith(`${prefix}/`);
  }
  return false;
}

export function validatePlanContract(plan, contract) {
  const errors = [];
  const warnings = [];

  if (!plan || typeof plan !== "object") {
    return { ok: false, errors: ["Plan contract must be an object."], warnings };
  }
  if (plan.schema !== PLAN_SCHEMA) {
    errors.push(`Plan schema must be ${PLAN_SCHEMA}.`);
  }
  if (!contract) {
    errors.push("A task contract is required to validate a plan.");
  } else {
    if (plan.taskId !== contract.id) {
      errors.push(`Plan taskId ${plan.taskId ?? "<missing>"} does not match ${contract.id}.`);
    }
    if (plan.contractDigest !== contract.source.bodyDigest) {
      errors.push("Plan contractDigest does not match the authoritative task contract.");
    }
  }
  if (!/^[0-9a-f]{40}$/i.test(String(plan.baseSha ?? ""))) {
    errors.push("Plan baseSha must be a full 40-character commit SHA.");
  }
  if (typeof plan.baseBranch !== "string" || !plan.baseBranch.trim()) {
    errors.push("Plan baseBranch is required.");
  }
  if (!isRisk(plan.risk)) {
    errors.push("Plan risk must be low, medium, high, or critical.");
  }
  if (typeof plan.objective !== "string" || !plan.objective.trim()) {
    errors.push("Plan objective is required.");
  }
  if (!nonEmptyStrings(plan.scope?.allowed)) {
    errors.push("Plan scope.allowed must contain at least one path or glob.");
  }
  for (const field of [
    "steps",
    "requiredChecks",
    "evidence",
    "decisionsAndHandoffs",
    "risks",
    "rollbackAndEscalation",
  ]) {
    if (!nonEmptyStrings(plan[field])) {
      errors.push(`Plan ${field} must contain at least one entry.`);
    }
  }

  const plannedCriteria = Array.isArray(plan.successCriteria)
    ? plan.successCriteria
    : [];
  if (contract) {
    for (const criterion of contract.successCriteria) {
      const match = plannedCriteria.find(({ id }) => id === criterion.id);
      if (!match) {
        errors.push(`Plan does not map success criterion ${criterion.id}.`);
      } else if (match.provenBy !== criterion.provenBy) {
        errors.push(
          `Plan changes the proving test for ${criterion.id}; reference the task contract instead.`,
        );
      }
    }
  }

  const assessment = inferRisk({
    paths: plan.scope?.allowed ?? [],
    operations: plan.operations ?? [],
  });
  if (isRisk(plan.risk) && riskRank(plan.risk) < riskRank(assessment.risk)) {
    errors.push(
      `Declared risk ${plan.risk} is lower than the deterministic floor ${assessment.risk}.`,
    );
  }

  const requiredChecks = isRisk(plan.risk)
    ? requiredChecksForRisk(plan.risk)
    : [];
  for (const check of requiredChecks) {
    if (!plan.requiredChecks?.includes(check)) {
      errors.push(`Plan risk ${plan.risk} requires check ${check}.`);
    }
  }

  if (contract) {
    const contractAllowed = contract.inputs.scope.allowed;
    for (const plannedPath of plan.scope?.allowed ?? []) {
      if (
        contractAllowed.length > 0 &&
        !contractAllowed.some((allowed) =>
          scopePatternWithin(plannedPath, allowed),
        )
      ) {
        errors.push(`${plannedPath} is outside the task contract's allowed scope.`);
      }
    }
  }

  if (approvalPolicyForRisk(isRisk(plan.risk) ? plan.risk : "critical").requirePlanOnlyApproval) {
    warnings.push("This risk level requires a human approval of the plan-only state.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    inferredRisk: assessment.risk,
    requiredChecks,
    planDigest: planDigest(plan),
  };
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const file = valueOf("--file");
  if (!file) {
    process.stderr.write("Pass --file <plan.md|plan.json>.\n");
    process.exit(2);
  }
  const absolute = resolve(REPO_ROOT, file);
  const raw = readFileSync(absolute, "utf8");
  const plan = file.endsWith(".json") ? JSON.parse(raw) : extractPlanContract(raw);
  if (!plan) {
    process.stderr.write("No machine-readable plan contract was found.\n");
    process.exit(1);
  }
  const result = validatePlanContract(plan, loadTaskContract());
  if (!result.ok) {
    process.stderr.write(`${result.errors.join("\n")}\n`);
    process.exit(1);
  }
  const out = valueOf("--out") ?? "artifacts/plan.json";
  const target = resolve(REPO_ROOT, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    `${JSON.stringify({ ...plan, planDigest: result.planDigest }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `plan=${plan.taskId} risk=${plan.risk} digest=${result.planDigest}\n${target}\n`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
