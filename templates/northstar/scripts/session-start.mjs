/**
 * Resolve the active task contract when an agent session starts.
 *
 * Wired to the SessionStart hook. Nobody should have to run a command by hand
 * before working: a contract you must remember to fetch is a contract that will
 * be missing exactly when it matters.
 *
 * The task is an INPUT. This hook reads exactly one source - the
 * AGENT_TASK_ISSUE environment variable - which exists for non-interactive
 * runs (CI and the cloud agent) where no human types a prompt.
 *
 * Interactive sessions do not use it. There, the human passes the issue number
 * to `/plan` or `/implement` and the UserPromptSubmit hook resolves it. Nothing
 * is inferred from the branch name or the open issue list any more: those
 * guesses were usually right, which is precisely why nobody checked them.
 *
 * With no issue, the session still starts and reports that no contract is
 * active. It deliberately does NOT fall back to a fixture under tests/fixtures:
 * those exist to recreate an issue, and silently treating one as the contract
 * would hide the fact that the real one was never read.
 */

import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CONTRACT_CACHE, splitProhibitions } from "./task-contract.mjs";
import {
  PLAN_CACHE,
  PLAN_CONTRACT_CACHE,
  resolveTask,
} from "./resolve-task.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

/** Drop a contract left by an earlier session so it cannot govern this one. */
function clearContract() {
  rmSync(resolve(REPO_ROOT, CONTRACT_CACHE), { force: true });
  rmSync(resolve(REPO_ROOT, PLAN_CACHE), { force: true });
  rmSync(resolve(REPO_ROOT, PLAN_CONTRACT_CACHE), { force: true });
}

export function resolveIssueNumber({ env = process.env } = {}) {
  if (env.AGENT_TASK_ISSUE) {
    return { number: Number(env.AGENT_TASK_ISSUE), how: "AGENT_TASK_ISSUE" };
  }
  return { number: null, how: "nothing" };
}

function summarize(contract, how, plan) {
  const criteria = contract.successCriteria
    .map((c) => `  ${c.id}: ${c.statement} (proven by: ${c.provenBy})`)
    .join("\n");

  const planSection = plan
    ? [
        "",
        "APPROVED PLAN, cached at artifacts/task-plan.md from the task's plan-first pull request:",
        "",
        plan,
        "",
        "Implement only what this plan describes. If it is missing or looks stale,",
        "stop and say so rather than planning again inside an implementation session.",
      ]
    : [
        "",
        "No human-approved plan matches this task. If you are implementing,",
        "stop: run the plan agent first, publish its plan-only PR, and get it approved. Do",
        "not plan and implement in the same session.",
      ];

  return [
    `ACTIVE TASK CONTRACT: ${contract.id} - ${contract.title}`,
    `Resolved from ${contract.source.kind} via ${how}. Cached at artifacts/task-contract.json.`,
    "",
    "This cached contract is the authority for this session. Do not read any file",
    "under tests/fixtures as the contract; those are offline test inputs, not the",
    "issue, not the issue itself.",
    "",
    `Allowed scope: ${contract.inputs.scope.allowed.join(", ")}`,
    `Prohibited paths, enforced before every tool call: ${splitProhibitions(contract.inputs.scope).paths.join(", ") || "none stated"}`,
    `Prohibited in prose, NOT enforced by any check - honour these yourself: ${splitProhibitions(contract.inputs.scope).advisory.join("; ") || "none stated"}`,
    `Authoritative sources: ${contract.inputs.authoritativeSources.join(", ")}`,
    `Constraints: ${contract.inputs.constraints.join("; ")}`,
    "",
    "Success criteria:",
    criteria,
    "",
    `Stop conditions: ${contract.stopConditions.join("; ")}`,
    ...planSection,
  ].join("\n");
}

function emit(additionalContext) {
  process.stdout.write(
    `${JSON.stringify(
      {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext,
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function main() {
  const resolution = resolveIssueNumber();

  if (!resolution.number) {
    // Clear any contract left by a previous session. Inheriting one would mean
    // an unrelated chat is judged against a task nobody is working on.
    clearContract();
    emit(
      "No task contract is active yet. AGENT_TASK_ISSUE is unset, so no issue " +
        "was read and no GitHub call was made. Nothing was inferred from the " +
        "branch name or the open issue list, by design. The capability boundary " +
        "is ungoverned: reads are allowed and writes ask. Do not substitute a " +
        "fixture file from tests/fixtures. To work on a task, name its issue: " +
        "`/plan <issue>` or `/implement <issue>`.",
    );
    return;
  }

  try {
    // Same resolver the UserPromptSubmit hook uses, so an interactive session
    // and a non-interactive one end up with byte-identical artifacts.
    const { contract, plan } = resolveTask(resolution.number);
    emit(summarize(contract, resolution.how, plan));
  } catch (error) {
    emit(
      `Issue #${resolution.number} was found but could not be read as a task contract: ` +
        `${/** @type {Error} */ (error).message.split("\n")[0]} ` +
        "Fix the issue body to match .github/ISSUE_TEMPLATE/agent-task.yml.",
    );
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
