import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { canonicalPlan, extractPlanContract, planDigest } from "./plan-contract.mjs";
import { githubJson, runGitHub } from "./github-api.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

export function validateCloudExecution({ pull, repository, contract, plan, branch, headSha, descendsFromApprovedBase }) {
  const planInPr = extractPlanContract(pull?.body);
  const issues = [...new Set([...String(pull?.body ?? "").matchAll(/\b(?:closes|fixes|resolves)\s+#(\d+)\b/gi)]
    .map((match) => Number(match[1])))];
  return Boolean(
    pull?.state === "open" &&
    pull?.user?.type === "Bot" &&
    Number.isSafeInteger(pull.number) &&
    pull.head?.repo?.full_name === repository &&
    pull.base?.repo?.full_name === repository &&
    pull.head?.ref === branch &&
    /^copilot\/[A-Za-z0-9._/-]+$/.test(branch) &&
    pull.head?.sha === headSha &&
    pull.base?.ref === plan.baseBranch &&
    pull.base?.sha === plan.baseSha &&
    planInPr && canonicalPlan(planInPr) === canonicalPlan(plan) &&
    issues.length === 1 && issues[0] === contract.source.issue &&
    descendsFromApprovedBase
  );
}

export function resolveCloudExecution(contract, plan, {
  run = runGitHub,
  vcs = (args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
} = {}) {
  const git = (args) => vcs(args).trim();
  const branch = git(["branch", "--show-current"]);
  const headSha = git(["rev-parse", "HEAD"]);
  const repository = githubJson("repos/{owner}/{repo}", { run }).full_name;
  const prs = JSON.parse(run(["pr", "list", "--head", branch, "--state", "open", "--limit", "2", "--json", "number"]));
  if (!Array.isArray(prs) || prs.length !== 1) throw new Error("Cloud execution requires one actual open PR for the current branch.");
  const pull = githubJson(`repos/{owner}/{repo}/pulls/${prs[0].number}`, { run });
  const comparison = githubJson(`repos/{owner}/{repo}/compare/${plan.baseSha}...${headSha}`, { run });
  const descendsFromApprovedBase = comparison.merge_base_commit?.sha === plan.baseSha &&
    ["ahead", "identical"].includes(comparison.status);
  if (!validateCloudExecution({ pull, repository, contract, plan, branch, headSha, descendsFromApprovedBase })) {
    throw new Error("The cloud PR does not bind the approved task, plan, base, branch, and current head.");
  }
  return {
    schema: "northstar/execution-context/1", host: "cloud",
    repository, pullRequest: pull.number, branch, headSha, baseSha: plan.baseSha,
    baseBranch: plan.baseBranch, taskId: contract.id,
    contractDigest: contract.source.bodyDigest, planDigest: planDigest(plan),
  };
}
