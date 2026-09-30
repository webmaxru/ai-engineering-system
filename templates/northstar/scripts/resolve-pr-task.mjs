import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cacheContract, contractFromIssue } from "./task-contract.mjs";
import { clearTaskState } from "./resolve-task.mjs";
import {
  bindWorkspaceOwner,
  claimWorkspaceOwner,
  releaseWorkspaceClaim,
  TASK_AUTHORITY_PATHS,
} from "./workspace-owner.mjs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function linkedIssue(body) {
  const matches = [...String(body ?? "").matchAll(/\b(?:closes|fixes|resolves)\s+#(\d+)\b/gi)];
  const issues = [...new Set(matches.map((match) => Number(match[1])))];
  if (issues.length > 1) throw new Error("Multiple task issues are linked; select one explicit task.");
  return issues[0] ?? null;
}

/** Allow replacement of imported caches only in the exact isolated PR workflow run. */
export function runScopedUnownedCachePaths(contract, env = process.env) {
  const repository = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/\d+$/
    .exec(contract?.source?.url ?? "")?.[1];
  if (env.GITHUB_ACTIONS !== "true" ||
      !repository || env.GITHUB_REPOSITORY !== repository ||
      !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? "") ||
      !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? "")) return [];
  return [...TASK_AUTHORITY_PATHS];
}

function main() {
  const pr = valueOf("--pr");
  if (!pr) {
    process.stderr.write("Pass --pr <number>.\n");
    process.exit(2);
  }
  let owner = null;
  try {
    const pull = JSON.parse(gh(["pr", "view", pr, "--json", "body"]));
    const issue = linkedIssue(pull.body);
    if (!issue) {
      throw new Error(
        "No task issue linked. Add `Closes #<number>` to the pull request body.",
      );
    }
    const contract = contractFromIssue(issue);
    owner = claimWorkspaceOwner({
      root: REPO_ROOT,
      issue,
      taskId: contract.id,
      contractDigest: contract.source.bodyDigest,
      sessionId: process.env.COPILOT_SESSION_ID ??
        process.env.COPILOT_SESSION_UUID ??
        process.env.COPILOT_AGENT_SESSION_ID ??
        null,
      allowUnownedStatePaths: runScopedUnownedCachePaths(contract),
      contract,
    });
    clearTaskState(REPO_ROOT, owner);
    bindWorkspaceOwner(owner, contract);
    const target = cacheContract(contract, undefined, owner);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `issue=${issue}\ntask=${contract.id}\n`,
        "utf8",
      );
    }
    process.stdout.write(
      `issue=${issue} task=${contract.id} digest=${contract.source.bodyDigest}\n${target}\n`,
    );
  } catch (error) {
    if (owner) {
      try {
        clearTaskState(REPO_ROOT, owner);
      } catch (cleanupError) {
        process.stderr.write(
          `Task resolution failed and owned-state cleanup also failed: ${error.message}; ${cleanupError.message}\n`,
        );
        process.exitCode = 1;
        return;
      }
    }
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 1;
  } finally {
    if (owner) releaseWorkspaceClaim(owner);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
