import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { matchesPattern } from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const POLICY_PATH = resolve(REPO_ROOT, ".github/governance/policy.json");

export const GOVERNANCE_POLICY = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
export const RISK_LEVELS = Object.freeze([...GOVERNANCE_POLICY.riskLevels]);

export function riskRank(risk) {
  return RISK_LEVELS.indexOf(String(risk));
}

export function isRisk(value) {
  return riskRank(value) !== -1;
}

export function maxRisk(...values) {
  const risks = values.flat().filter(isRisk);
  return risks.reduce(
    (highest, risk) => (riskRank(risk) > riskRank(highest) ? risk : highest),
    "low",
  );
}

function patternPrefix(pattern) {
  return String(pattern).replace(/\\/g, "/").split("*", 1)[0].replace(/\/+$/, "");
}

function overlaps(left, right) {
  if (matchesPattern(left, right) || matchesPattern(right, left)) {
    return true;
  }
  const leftPrefix = patternPrefix(left);
  const rightPrefix = patternPrefix(right);
  return Boolean(leftPrefix) && Boolean(rightPrefix) &&
    (leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix));
}

export function inferRisk({ paths = [], operations = [] } = {}) {
  const pathMatches = paths.map((path) => {
    const candidates = GOVERNANCE_POLICY.pathRisk.filter(({ pattern }) =>
      overlaps(path, pattern),
    );
    const rule = candidates.reduce(
      (highest, candidate) =>
        !highest || riskRank(candidate.risk) > riskRank(highest.risk)
          ? candidate
          : highest,
      null,
    );
    return {
      path,
      risk: rule?.risk ?? "medium",
      reason: rule?.reason ?? "No path-specific rule matched.",
    };
  });

  const operationMatches = operations.map((operation) => ({
    operation,
    risk: GOVERNANCE_POLICY.operationRisk[operation] ?? "medium",
  }));

  return {
    risk: maxRisk(
      pathMatches.map(({ risk }) => risk),
      operationMatches.map(({ risk }) => risk),
    ),
    pathMatches,
    operationMatches,
  };
}

export function requiredChecksForRisk(risk) {
  if (!isRisk(risk)) {
    throw new Error(`Unknown risk level: ${risk}`);
  }
  return [...GOVERNANCE_POLICY.requiredChecks[risk]];
}

export function approvalPolicyForRisk(risk) {
  if (!isRisk(risk)) {
    throw new Error(`Unknown risk level: ${risk}`);
  }
  const approvals = GOVERNANCE_POLICY.humanApproval;
  return {
    minimumApprovals: approvals[risk],
    requireLatestHead: approvals.requireLatestHeadFor.includes(risk),
    requirePlanOnlyApproval: approvals.requirePlanOnlyApprovalFor.includes(risk),
    requireCodeOwnerReview: approvals.requireCodeOwnerReviewFor.includes(risk),
  };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const paths = process.argv.slice(2);
  process.stdout.write(`${JSON.stringify(inferRisk({ paths }), null, 2)}\n`);
}
