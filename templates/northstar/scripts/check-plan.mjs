/**
 * Plan gate: fail the PR unless it carries a reviewable plan.
 *
 * Microsoft Learn turns "include a plan" from a process expectation into a
 * system guarantee by making a Plan Gate a required status check:
 * https://learn.microsoft.com/en-us/training/modules/design-agent-architecture-integration/5-pull-request-governance-controls
 *
 * Learn's snippet checks that the pull request template file exists in the
 * repository. That passes on every PR in a repo that has the template, including
 * one whose description is empty - it proves the template exists, not that this
 * PR used it. This checks the pull request description instead, which is the
 * thing Learn actually asks for: "a structured plan in the pull request
 * description".
 *
 * Usage: node scripts/check-plan.mjs --pr <number>
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  extractPlanContract,
  planDigest,
  validatePlanContract,
} from "./plan-contract.mjs";
import { PLAN_HEADING, extractPlanSection } from "./publish-plan.mjs";
import { loadTaskContract } from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

/** Sections a plan must fill in to be reviewable, per Learn's PR template. */
export const REQUIRED_SECTIONS = [
  { label: "objective", pattern: /^## Objective\b/im },
  { label: "plan", pattern: /^## Plan\b/im },
  { label: "scope", pattern: /scope|files to change/i },
  { label: "success criteria", pattern: /success criteria|validation/i },
  { label: "evidence", pattern: /evidence/i },
  { label: "decisions and handoffs", pattern: /decisions and handoffs/i },
  { label: "risks", pattern: /risks?/i },
  { label: "rollback or escalation", pattern: /rollback|escalat/i },
];

const PLACEHOLDER = /(_?TBD_?|<!--\s*fill|\$\{input:)/i;

export function validatePlan(prBody, contract = loadTaskContract()) {
  const plan = extractPlanSection(prBody);
  if (!plan) {
    return {
      ok: false,
      reason:
        `No ${PLAN_HEADING} section with content in the pull request description. ` +
        "Learn asks for a structured plan in the PR description; an empty template is not one.",
    };
  }

  if (PLACEHOLDER.test(plan)) {
    return {
      ok: false,
      reason: "The plan section still contains template placeholders.",
    };
  }

  const missing = REQUIRED_SECTIONS.filter(
    ({ pattern }) => !pattern.test(plan),
  ).map(({ label }) => label);
  if (missing.length > 0) {
    return {
      ok: false,
      reason:
        `The plan does not state: ${missing.join(", ")}. ` +
        "Learn: plans become reviewable when they include scope, success criteria, and a rollback or escalation path.",
    };
  }

  const machinePlan = extractPlanContract(plan);
  if (!machinePlan) {
    return {
      ok: false,
      reason:
        "The plan has no northstar/plan/1 machine-readable contract. Risk routing cannot depend on narrative prose.",
    };
  }
  const validation = validatePlanContract(machinePlan, contract);
  if (!validation.ok) {
    return {
      ok: false,
      reason: `The machine-readable plan is invalid: ${validation.errors.join(" ")}`,
    };
  }

  return {
    ok: true,
    reason:
      `The pull request description carries a reviewable ${machinePlan.risk}-risk plan ` +
      `bound to contract ${machinePlan.contractDigest} and base ${machinePlan.baseSha}.`,
  };
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const pr = valueOf("--pr");
  if (!pr) {
    process.stderr.write("Pass --pr <number>.\n");
    process.exit(2);
  }

  const raw = execFileSync("gh", ["pr", "view", pr, "--json", "body,headRefOid"], {
    encoding: "utf8",
  });
  const pull = JSON.parse(raw);
  const expectedHead = valueOf("--expected-head");
  if (expectedHead && pull.headRefOid !== expectedHead) {
    process.stderr.write(
      `Pull request head ${pull.headRefOid} does not match expected workflow SHA ${expectedHead}.\n`,
    );
    process.exit(1);
  }
  const result = validatePlan(pull.body);

  process.stdout.write(`${result.ok ? "pass" : "fail"}: ${result.reason}\n`);
  if (result.ok) {
    const body = pull.body;
    const plan = extractPlanContract(extractPlanSection(body));
    const target = resolve(REPO_ROOT, "artifacts/plan.json");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      `${JSON.stringify({ ...plan, planDigest: planDigest(plan) }, null, 2)}\n`,
      "utf8",
    );
  }
  if (expectedHead) {
    const after = JSON.parse(
      execFileSync(
        "gh",
        ["pr", "view", pr, "--json", "body,headRefOid"],
        { encoding: "utf8" },
      ),
    );
    if (after.headRefOid !== expectedHead || after.body !== pull.body) {
      process.stderr.write(
        "Pull request head or plan body changed during plan evaluation.\n",
      );
      process.exit(1);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
