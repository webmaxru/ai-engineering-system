import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createCheckRecord, evidencePath, hasLiveTaskIdentity, readEvidenceJson, writeCheckRecord,
} from "./evidence-record.mjs";
import { githubJson, runGitHub } from "./github-api.mjs";
import { canonicalPlan, extractPlanContract, planDigest, validatePlanContract } from "./plan-contract.mjs";
import { extractPlanSection, fetchApprovedPlan, fetchProposedPlan } from "./publish-plan.mjs";
import { linkedIssue } from "./resolve-pr-task.mjs";
import { approvalPolicyForRisk } from "./risk-policy.mjs";
import { cacheContract, contractFromIssue, loadTaskContract } from "./task-contract.mjs";
import { claimWorkspaceOwner, releaseWorkspaceClaim } from "./workspace-owner.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const SHA = /^[0-9a-f]{40}$/;
const CACHE_PATHS = ["artifacts/plan.json", "artifacts/approved-plan.json", "artifacts/candidate-plan.json"];

export function executionPlanRequirements(contract, plan) {
  const repository = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/\d+$/.exec(contract?.source?.url ?? "")?.[1];
  if (!repository || !hasLiveTaskIdentity(contract, repository)) {
    throw new Error("Execution plan selection requires the trusted live task contract.");
  }
  const validation = validatePlanContract(plan, contract);
  if (!validation.ok) throw new Error(`Invalid execution plan: ${validation.errors.join("; ")}`);
  const approvalRequired = approvalPolicyForRisk(plan.risk).requirePlanOnlyApproval;
  if (!approvalRequired && (Object.hasOwn(plan, "approval") || plan.requiredChecks.includes("plan-approval"))) {
    throw new Error("A combined low/medium plan must not claim or require plan-only approval.");
  }
  return {
    repository, risk: plan.risk, approvalRequired,
    requiredChecks: [...plan.requiredChecks], planDigest: planDigest(plan),
    planPath: approvalRequired ? "artifacts/approved-plan.json" : "artifacts/candidate-plan.json",
  };
}

function readCandidatePull(contract, candidate, {
  pullRequest, expectedHead, run, allowMerged = false,
}) {
  if (!Number.isSafeInteger(pullRequest) || pullRequest < 1 || !SHA.test(expectedHead ?? "")) {
    throw new Error("Hosted plan selection requires an explicit PR and immutable expected head.");
  }
  const requirements = executionPlanRequirements(contract, candidate);
  const pull = githubJson(`repos/{owner}/{repo}/pulls/${pullRequest}`, { run });
  const isOpen = pull.state === "open";
  const isMerged = allowMerged && pull.state === "closed" && pull.merged === true &&
    typeof pull.merged_at === "string" && SHA.test(pull.merge_commit_sha ?? "");
  if (pull.number !== pullRequest || (!isOpen && !isMerged) ||
    pull.head?.sha !== expectedHead || (isOpen && pull.base?.sha !== candidate.baseSha) ||
    pull.base?.ref !== candidate.baseBranch ||
    pull.head?.repo?.full_name !== requirements.repository ||
    pull.base?.repo?.full_name !== requirements.repository ||
    linkedIssue(pull.body) !== contract.source.issue) {
    throw new Error("The implementation PR does not match the selected task, repository, base, or head.");
  }
  const current = extractPlanContract(extractPlanSection(pull.body));
  executionPlanRequirements(contract, current);
  if (planDigest(current) !== requirements.planDigest) {
    throw new Error("The candidate differs from the current implementation PR plan.");
  }
  const comparison = githubJson(`repos/{owner}/{repo}/compare/${candidate.baseSha}...${expectedHead}`, { run });
  if (comparison.merge_base_commit?.sha !== candidate.baseSha || !["ahead", "identical"].includes(comparison.status)) {
    throw new Error("The implementation head does not descend from the exact plan base.");
  }
  return { requirements, pull };
}

function approvedSelection(contract, candidate, { run, readApprovedPlan, pullRequest }) {
  const canaryPlan = Boolean(candidate?.canaryFor);
  if (canaryPlan && (!Number.isSafeInteger(pullRequest) || pullRequest < 1)) {
    throw new Error("Canary plan approval requires its explicit current plan PR.");
  }
  const resolved = readApprovedPlan(contract, {
    run,
    ...(canaryPlan ? { planPrNumber: pullRequest } : {}),
  });
  if (!resolved) throw new Error("No current independent plan-only approval matches this task.");
  const requirements = executionPlanRequirements(contract, resolved.plan);
  const approval = resolved.approval;
  if (!requirements.approvalRequired ||
    (candidate && planDigest(candidate) !== requirements.planDigest) ||
    !["northstar/plan-approval/1", "northstar/plan-approval/2"].includes(approval?.schema) ||
    approval.taskId !== contract.id || approval.contractDigest !== contract.source.bodyDigest ||
    approval.planDigest !== requirements.planDigest || approval.baseSha !== resolved.plan.baseSha ||
    approval.reviewedCommit !== resolved.pr.headRefOid || approval.planPr !== resolved.pr.number ||
    !Number.isSafeInteger(approval.reviewId) || approval.reviewId < 1 ||
    approval.planOnly !== true || approval.reviewer === resolved.pr.author.login) {
    throw new Error("The live approval does not bind the exact high/critical execution plan.");
  }
  return {
    ...requirements, approvalState: "approved",
    plan: { ...resolved.plan, planDigest: requirements.planDigest, approval },
    body: resolved.body,
  };
}

export function selectExecutionPlan({
  contract, candidate, pullRequest, expectedHead,
}, {
  run = runGitHub, readApprovedPlan = fetchApprovedPlan, readProposedPlan = fetchProposedPlan,
  requirementsOnly = false, approvalOnly = false, allowMerged = false,
} = {}) {
  if (requirementsOnly && approvalOnly) {
    throw new Error("An approval-only operation cannot bypass live approval resolution.");
  }
  if (approvalOnly && pullRequest === undefined && expectedHead === undefined) {
    if (candidate) {
      const requirements = executionPlanRequirements(contract, candidate);
      if (!requirements.approvalRequired) throw new Error("Plan-only approval is not required for this combined plan.");
    }
    return approvedSelection(contract, candidate, { run, readApprovedPlan, pullRequest });
  }
  const { requirements, pull } = readCandidatePull(contract, candidate, {
    pullRequest, expectedHead, run, allowMerged,
  });
  if (approvalOnly && !requirements.approvalRequired) {
    throw new Error("Plan-only approval is not required; select the same-PR proposed plan instead.");
  }
  let selected;
  if (requirementsOnly) {
    selected = {
      ...requirements, approvalState: requirements.approvalRequired ? "missing" : "proposed",
      plan: { ...JSON.parse(canonicalPlan(candidate)), planDigest: requirements.planDigest },
      body: extractPlanSection(pull.body),
    };
  } else if (requirements.approvalRequired) {
    selected = approvedSelection(contract, candidate, { run, readApprovedPlan, pullRequest });
  } else {
    const proposed = readProposedPlan(contract, { pullRequest, expectedHead, run });
    if (!proposed || proposed.approval !== null || Object.hasOwn(proposed.plan, "approval") ||
      proposed.pr.number !== pullRequest || proposed.pr.headRefOid !== expectedHead ||
      proposed.pr.baseRefOid !== candidate.baseSha ||
      executionPlanRequirements(contract, proposed.plan).planDigest !== requirements.planDigest) {
      throw new Error("No validated same-PR proposal matches the selected execution.");
    }
    selected = {
      ...requirements, approvalState: "proposed",
      plan: { ...proposed.plan, planDigest: requirements.planDigest },
      body: proposed.body,
    };
  }
  const after = githubJson(`repos/{owner}/{repo}/pulls/${pullRequest}`, { run });
  const stillOpen = after.state === "open";
  const stillMerged = allowMerged && after.state === "closed" && after.merged === true &&
    typeof after.merged_at === "string" && after.merge_commit_sha === pull.merge_commit_sha;
  if ((!stillOpen && !stillMerged) || after.head?.sha !== expectedHead ||
    (stillOpen && after.base?.sha !== pull.base.sha) ||
    after.base?.ref !== pull.base.ref || after.body !== pull.body ||
    after.head?.repo?.full_name !== requirements.repository || after.base?.repo?.full_name !== requirements.repository) {
    throw new Error("The implementation PR changed during execution-plan selection.");
  }
  return selected;
}

export function approvalEvidenceInput(selection) {
  if (selection.approvalRequired && selection.approvalState !== "approved") {
    throw new Error("An unapproved required plan cannot produce passing approval evidence.");
  }
  return {
    id: "plan-approval", category: "approval",
    required: selection.approvalRequired,
    status: selection.approvalRequired ? "pass" : "skipped",
    artifact: selection.approvalRequired ? "artifacts/approved-plan.json" : "artifacts/plan.json",
    summary: selection.approvalRequired
      ? "Current independent plan-only approval was verified."
      : `not-required: ${selection.risk} risk uses the validated plan in the implementation PR; no approval was created.`,
  };
}

export function cacheExecutionPlan(input, {
  root = REPO_ROOT, env = process.env, recordApproval = false, ...selectionOptions
} = {}) {
  const claim = claimWorkspaceOwner({
    root,
    issue: input.contract.source.issue,
    taskId: input.contract.id,
    contractDigest: input.contract.source.bodyDigest,
    env,
    contract: input.contract,
  });
  const clear = () => {
    for (const path of CACHE_PATHS) rmSync(evidencePath(path, root), { force: true });
    if (recordApproval) rmSync(evidencePath("artifacts/checks/plan-approval.json", root), { force: true });
  };
  const write = (path, data) => {
    const target = evidencePath(path, root);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
  };
  const record = (data, plan) => writeCheckRecord(createCheckRecord(data, {
    ...env, NORTHSTAR_JOB_ID: "plan-approval",
  }, { root, contract: input.contract, plan }), undefined, root);
  try {
    clear();
    try {
      if ((env.PR_NUMBER && input.pullRequest !== undefined && Number(env.PR_NUMBER) !== input.pullRequest) ||
        (env.NORTHSTAR_HEAD_SHA && input.expectedHead && env.NORTHSTAR_HEAD_SHA !== input.expectedHead) ||
        (env.BASE_SHA && input.candidate && env.BASE_SHA !== input.candidate.baseSha) ||
        (env.GITHUB_REPOSITORY && !hasLiveTaskIdentity(input.contract, env.GITHUB_REPOSITORY))) {
        throw new Error("The workflow execution context differs from the selected task, repository, PR, base, or head.");
      }
      const selected = selectExecutionPlan(input, selectionOptions);
      const candidate = JSON.parse(canonicalPlan(input.candidate ?? selected.plan));
      write("artifacts/candidate-plan.json", { ...candidate, planDigest: selected.planDigest });
      write("artifacts/plan.json", selected.plan);
      if (selected.approvalState === "approved") write("artifacts/approved-plan.json", selected.plan);
      if (recordApproval) record(approvalEvidenceInput(selected), selected.plan);
      return selected;
    } catch (error) {
      clear();
      if (recordApproval) {
        try {
          record({
            id: "plan-approval", category: "approval", required: true, status: "fail",
            summary: "Execution-plan selection failed; approval was not established.",
            artifact: "artifacts/approved-plan.json",
          }, input.candidate ?? null);
        } catch (recordError) {
          throw new AggregateError([error, recordError],
            `Plan selection failed: ${error.message}; failure evidence could not be written: ${recordError.message}`,
            { cause: recordError });
        }
      }
      throw error;
    }
  } finally {
    releaseWorkspaceClaim(claim);
  }
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function executionPlanMain({ approvalOnly = false } = {}) {
  try {
    const candidate = readEvidenceJson(valueOf("--expected-plan") ?? "artifacts/plan.json");
    const cached = loadTaskContract();
    const issue = Number(valueOf("--issue") ?? cached?.source?.issue);
    if (!Number.isSafeInteger(issue) || issue < 1) throw new Error("An explicit live task issue is required.");
    const contract = contractFromIssue(issue);
    const pullRequest = valueOf("--pr");
    const selected = cacheExecutionPlan({
      contract, candidate,
      ...(pullRequest ? { pullRequest: Number(pullRequest) } : {}),
      ...(valueOf("--expected-head") ? { expectedHead: valueOf("--expected-head") } : {}),
    }, {
      approvalOnly, requirementsOnly: process.argv.includes("--requirements-only"),
      allowMerged: process.argv.includes("--allow-merged"),
      recordApproval: process.argv.includes("--record-approval"),
    });
    cacheContract(contract);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT,
        `risk=${selected.risk}\napproval_required=${selected.approvalRequired}\n` +
        `approval_state=${selected.approvalState}\nplan_path=${selected.planPath}\n` +
        `required_checks=${JSON.stringify(selected.requiredChecks)}\n`);
    }
    process.stdout.write(`plan=${contract.id} risk=${selected.risk} approval=${selected.approvalState} selected=${selected.planPath}\n`);
  } catch (error) {
    process.stderr.write(`Execution-plan selection failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) executionPlanMain();
