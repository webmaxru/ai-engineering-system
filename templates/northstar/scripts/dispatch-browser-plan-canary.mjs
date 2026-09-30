import { pathToFileURL } from "node:url";
import { fetchApprovedPlan } from "./publish-plan.mjs";
import { githubJson, runGitHub } from "./github-api.mjs";
import { planDigest, validatePlanContract } from "./plan-contract.mjs";
import { readEvidenceJson } from "./evidence-record.mjs";
import { loadTaskContract } from "./task-contract.mjs";

const SHA = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function browserCanaryDispatchArgs(plan, {
  planPrNumber,
  planHeadSha,
  defaultBranch,
} = {}) {
  if (!plan?.canaryFor) return null;
  const binding = plan.canaryFor;
  if (!Number.isSafeInteger(planPrNumber) || planPrNumber < 1 ||
      !SHA.test(planHeadSha ?? "") ||
      typeof defaultBranch !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(defaultBranch) ||
      plan.baseBranch !== defaultBranch ||
      binding.sourcePullRequest === planPrNumber ||
      !Number.isSafeInteger(binding.sourcePullRequest) || binding.sourcePullRequest < 1 ||
      !SHA.test(binding.sourceHeadSha ?? "") ||
      !POSITIVE_INTEGER.test(String(binding.sourceRunId ?? "")) ||
      !POSITIVE_INTEGER.test(String(binding.sourceEvidenceRunId ?? ""))) {
    throw new Error("The canary plan cannot dispatch without exact original and current PR identities.");
  }
  return [
    "workflow", "run", "system-maintenance-approval.yml",
    "--ref", defaultBranch,
    "-f", `pull-request=${binding.sourcePullRequest}`,
    "-f", `head-sha=${binding.sourceHeadSha}`,
    "-f", `evidence-run-id=${binding.sourceEvidenceRunId}`,
    "-f", `source-run-id=${binding.sourceRunId}`,
    "-f", `canary-plan-pr-number=${planPrNumber}`,
    "-f", `canary-plan-head-sha=${planHeadSha}`,
  ];
}

function main() {
  if (process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_WORKFLOW !== "Publish Evidence" ||
      process.env.GITHUB_EVENT_NAME !== "workflow_run") {
    throw new Error("Canary dispatch runs only in trusted Publish Evidence workflow_run context.");
  }
  const plan = readEvidenceJson("artifacts/approved-plan.json");
  if (!plan?.canaryFor) {
    process.stdout.write("browser-plan-canary-dispatch=skipped reason=no-canary-plan\n");
    return;
  }
  const contract = loadTaskContract();
  if (!contract) throw new Error("The trusted canary task contract is unavailable.");
  const validation = validatePlanContract(plan, contract);
  if (!validation.ok) throw new Error(`The trusted canary plan is invalid: ${validation.errors.join(" ")}`);

  const planPrNumber = Number(process.env.PR_NUMBER);
  const planHeadSha = process.env.NORTHSTAR_HEAD_SHA;
  if (!Number.isSafeInteger(planPrNumber) || planPrNumber < 1 || !SHA.test(planHeadSha ?? "")) {
    throw new Error("The current canary plan PR and immutable head are required.");
  }
  const selection = fetchApprovedPlan(contract, { planPrNumber });
  if (!selection || selection.pr.number !== planPrNumber ||
      selection.pr.headRefOid !== planHeadSha ||
      planDigest(selection.plan) !== planDigest(plan)) {
    throw new Error("The current native canary plan approval changed before dispatch.");
  }
  const repository = githubJson("repos/{owner}/{repo}");
  if (process.env.GITHUB_REF !== `refs/heads/${repository.default_branch}`) {
    throw new Error("Canary dispatch requires the protected default-branch publisher checkout.");
  }
  const args = browserCanaryDispatchArgs(selection.plan, {
    planPrNumber,
    planHeadSha,
    defaultBranch: repository.default_branch,
  });
  if (!args) throw new Error("The validated canary plan lost its original binding.");
  if (!process.env.NORTHSTAR_DISPATCH_TOKEN) {
    throw new Error("The dedicated maintenance-dispatch token is required.");
  }
  runGitHub(args, { token: process.env.NORTHSTAR_DISPATCH_TOKEN });
  process.stdout.write(
    `browser-plan-canary-dispatch=queued source_pr=${selection.plan.canaryFor.sourcePullRequest} canary_pr=${planPrNumber}\n`,
  );
}

const invokedDirectly = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Browser canary dispatch failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
