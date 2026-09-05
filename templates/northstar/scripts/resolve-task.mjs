/**
 * Resolve the task contract from the issue number the human typed.
 *
 * Wired to the `UserPromptSubmit` hook. The issue number is an input to the
 * task, so it is given, never inferred: branch-name matching and
 * "the only open agent-task issue" were both guesses, and a guess that is
 * usually right is worse than no guess at all, because nobody checks it.
 *
 * The hook does the fetching so the agents do not have to. `plan` is read-only
 * by design and has no shell; if resolving the contract needed a terminal
 * command, either the plan agent gets write-adjacent capability it should not
 * have, or a human runs a command by hand before every session.
 *
 * Behaviour:
 *   - prompt does not invoke a task agent  -> do nothing, no GitHub call
 *   - invokes one, no issue number         -> stop the turn before any tokens
 *   - invokes one with an issue number     -> cache contract and plan, continue
 *
 * Sources: https://code.visualstudio.com/docs/agent-customization/hooks
 *          https://code.visualstudio.com/docs/agents/reference/hooks-reference
 */

import { Buffer } from "node:buffer";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cacheContract, contractFromIssue } from "./task-contract.mjs";
import { fetchApprovedPlan } from "./publish-plan.mjs";
import { planDigest } from "./plan-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

export const PLAN_CACHE = "artifacts/task-plan.md";
export const PLAN_CONTRACT_CACHE = "artifacts/plan.json";

/**
 * Does this prompt start work that a task contract must govern?
 *
 * Matched two ways because it is not documented whether `UserPromptSubmit`
 * receives the raw `/plan 4` or the expanded body of the prompt file. Both
 * forms are recognized, so the hook behaves the same either way.
 */
export function isTaskInvocation(prompt) {
  const text = String(prompt ?? "");
  return (
    /^\s*\/(plan|implement)\b/m.test(text) || /^\s*Task issue:/im.test(text)
  );
}

/** The issue number the human supplied, or null. */
export function extractIssue(prompt) {
  const text = String(prompt ?? "");
  const patterns = [
    /^\s*Task issue:\s*#?(\d+)/im,
    /--issue\s+#?(\d+)/i,
    /^\s*\/(?:plan|implement)\s+#?(\d+)\b/m,
    /(?:^|\s)#(\d+)\b/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return Number(match[match.length - 1]);
  }
  return null;
}

export function decide(prompt) {
  if (!isTaskInvocation(prompt)) {
    return { action: "ignore" };
  }
  const issue = extractIssue(prompt);
  if (!issue) {
    return {
      action: "stop",
      reason:
        "No task issue number. The plan and implement prompts take the issue as " +
        "an argument - for example `/plan 4` or `/implement 4`. Nothing was " +
        "inferred from the branch name or from the open issue list on purpose: " +
        "the task is an input, not a guess. Rerun with the number.",
    };
  }
  return { action: "resolve", issue };
}

function writeArtifact(relativePath, body) {
  const target = resolve(REPO_ROOT, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body, "utf8");
  return target;
}

/** Read the issue, cache the contract, and cache the approved plan beside it. */
export function resolveTask(issue) {
  const contract = contractFromIssue(issue);
  cacheContract(contract);

  // The plan lives in the plan-first pull request, not on the issue: the issue
  // is the contract, the PR is the proposal about it.
  let approved;
  try {
    approved = fetchApprovedPlan(contract);
  } catch {
    approved = null;
  }
  const plan = approved?.body ?? null;
  if (plan) {
    writeArtifact(PLAN_CACHE, `${plan}\n`);
    writeArtifact(
      PLAN_CONTRACT_CACHE,
      `${JSON.stringify(
        {
          ...approved.plan,
          planDigest: planDigest(approved.plan),
          approval: approved.approval,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    rmSync(resolve(REPO_ROOT, PLAN_CACHE), { force: true });
    rmSync(resolve(REPO_ROOT, PLAN_CONTRACT_CACHE), { force: true });
  }
  return { contract, plan };
}

export function renderResult({ contract, plan, issue }) {
  return (
    `Task contract for issue #${issue} (${contract.id}) cached at artifacts/task-contract.json. ` +
    (plan
      ? "The human-approved plan from its plan-first pull request is cached at artifacts/task-plan.md."
      : "No human-approved plan matches this task yet - plan, publish, and approve before implementing.")
  );
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const raw = await readStdin();
  let prompt;
  try {
    const payload = JSON.parse(raw);
    prompt = payload.prompt ?? payload.userPrompt ?? "";
  } catch {
    // A malformed payload must not stop an unrelated turn.
    emit({ continue: true });
    return;
  }

  const decision = decide(prompt);
  if (decision.action === "ignore") {
    emit({ continue: true });
    return;
  }
  if (decision.action === "stop") {
    emit({ continue: false, stopReason: decision.reason });
    return;
  }

  try {
    const { contract, plan } = resolveTask(decision.issue);
    emit({
      continue: true,
      systemMessage: renderResult({ contract, plan, issue: decision.issue }),
    });
  } catch (error) {
    emit({
      continue: false,
      stopReason:
        `Issue #${decision.issue} could not be read as a task contract: ` +
        `${/** @type {Error} */ (error).message.split("\n")[0]} ` +
        "Fix the issue body to match .github/ISSUE_TEMPLATE/agent-task.yml, or pass a different number.",
    });
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
