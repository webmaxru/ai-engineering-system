import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createCheckRecord,
  evidencePath,
  readEvidenceJson,
  SOURCE_RUN_PATH,
  writeCheckRecord,
} from "./evidence-record.mjs";
import { fetchApprovedPlan } from "./publish-plan.mjs";
import { githubJson } from "./github-api.mjs";
import { planDigest, validatePlanContract } from "./plan-contract.mjs";
import { loadTaskContract } from "./task-contract.mjs";

const CANARY_SCHEMA = "northstar/browser-plan-canary/1";
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isPositiveDecimal(value) {
  return typeof value === "string" && POSITIVE_INTEGER.test(value);
}

export function buildBrowserPlanCanaryEvidence({
  repository,
  contract,
  sourcePlan,
  sourceRun,
  sourcePull,
  sourceRunInfo,
  evidenceRunInfo,
  sourceMergeComparison,
  evidenceRunId,
  canarySelection,
  canaryPlanNumber,
  canaryHeadSha,
}) {
  const errors = [];
  const sourcePlanValidation = validatePlanContract(sourcePlan, contract);
  if (!sourcePlanValidation.ok || planDigest(sourcePlan) !== sourcePlan.planDigest) {
    errors.push("The original approved implementation plan is invalid or has a stale digest.");
  }
  if (!sourceRun || sourceRun.schema !== "northstar/source-run/1" ||
    sourceRun.repository !== repository || sourceRun.taskId !== contract.id ||
    sourceRun.contractDigest !== contract.source.bodyDigest ||
    sourceRun.planDigest !== planDigest(sourcePlan) ||
    !positiveInteger(Number(sourceRun.pullRequest)) ||
    !SHA.test(sourceRun.headSha ?? "") || sourceRun.baseSha !== sourcePlan.baseSha ||
    !isPositiveDecimal(sourceRun.runId) || !isPositiveDecimal(sourceRun.runAttempt)) {
    errors.push("The original source-run snapshot does not match the task, plan, base, PR, head, and attempt.");
  }
  if (!positiveInteger(Number(evidenceRunId)) ||
    Number(evidenceRunInfo?.id) !== Number(evidenceRunId) ||
    evidenceRunInfo?.repository?.full_name !== repository ||
    evidenceRunInfo?.path !== ".github/workflows/publish-evidence.yml" ||
    evidenceRunInfo?.event !== "workflow_run" || evidenceRunInfo?.status !== "completed" ||
    evidenceRunInfo?.conclusion !== "success") {
    errors.push("The original trusted evidence run is missing or does not match the source run.");
  }
  if (!sourcePull || Number(sourcePull.number) !== Number(sourceRun?.pullRequest) ||
    sourcePull.head?.sha !== sourceRun?.headSha || sourcePull.base?.ref !== sourcePlan?.baseBranch ||
    sourcePull.head?.repo?.full_name !== repository || sourcePull.base?.repo?.full_name !== repository ||
    sourcePull.merged !== true || typeof sourcePull.merge_commit_sha !== "string" ||
    !SHA.test(sourcePull.merge_commit_sha)) {
    errors.push("The original implementation PR is not merged at the verified source head and base.");
  }
  if (!sourceMergeComparison ||
    sourceMergeComparison.merge_base_commit?.sha !== sourceRun?.baseSha ||
    !Number.isSafeInteger(sourceMergeComparison.total_commits) ||
    sourceMergeComparison.total_commits !== sourceMergeComparison.commits?.length ||
    sourceMergeComparison.commits?.at(-1)?.sha !== sourcePull?.merge_commit_sha ||
    sourceMergeComparison.status !== "ahead") {
    errors.push("The original merge commit is not on the verified source base ancestry.");
  }
  if (!sourceRunInfo || Number(sourceRunInfo.id) !== Number(sourceRun?.runId) ||
    Number(sourceRunInfo.run_attempt) !== Number(sourceRun?.runAttempt) ||
    sourceRunInfo.repository?.full_name !== repository ||
    sourceRunInfo.path !== ".github/workflows/governed-change.yml" ||
    !["pull_request", "pull_request_review"].includes(sourceRunInfo.event) ||
    sourceRunInfo.status !== "completed" || sourceRunInfo.head_sha !== sourceRun?.headSha ||
    !(sourceRunInfo.pull_requests ?? []).some(({ number }) => Number(number) === Number(sourceRun?.pullRequest))) {
    errors.push("The original Governed Change run is not the exact completed source run for the implementation PR.");
  }

  const canaryPlan = canarySelection?.plan;
  const canaryApproval = canarySelection?.approval;
  const canaryPr = canarySelection?.pr;
  const canaryPlanValidation = validatePlanContract(canaryPlan, contract);
  const canaryFor = canaryPlan?.canaryFor;
  const originalApproval = sourcePlan?.approval;
  if (originalApproval?.schema !== "northstar/plan-approval/1" ||
    originalApproval?.taskId !== contract.id ||
    originalApproval?.contractDigest !== contract.source.bodyDigest ||
    originalApproval?.planDigest !== planDigest(sourcePlan) ||
    originalApproval?.baseSha !== sourcePlan.baseSha ||
    !SHA.test(originalApproval?.reviewedCommit ?? "") ||
    !positiveInteger(originalApproval?.planPr) ||
    !positiveInteger(originalApproval?.reviewId) ||
    originalApproval?.planOnly !== true ||
    typeof originalApproval?.reviewer !== "string" || !originalApproval.reviewer.trim()) {
    errors.push("The original bootstrap plan does not carry its durable, current human-approval record.");
  }
  if (!canaryPlanValidation.ok || canaryPlan?.taskId !== contract.id ||
    canaryPr?.number !== Number(canaryPlanNumber) || canaryPr?.headRefOid !== canaryHeadSha ||
    canaryPr?.url !== `https://github.com/${repository}/pull/${Number(canaryPlanNumber)}` ||
    canaryPr?.isDraft !== false || canaryPr?.baseRefOid !== canaryPlan?.baseSha ||
    !SHA.test(canaryHeadSha ?? "") || !DIGEST.test(planDigest(canaryPlan))) {
    errors.push("The canary plan PR, immutable head, or plan contract does not match the requested canary.");
  }
  if (canaryApproval?.schema !== "northstar/plan-approval/2" ||
    canaryApproval?.source !== "github-review" ||
    canaryApproval?.planPr !== Number(canaryPlanNumber) ||
    canaryApproval?.reviewedCommit !== canaryHeadSha ||
    !positiveInteger(canaryApproval?.reviewId) ||
    !canaryApproval?.reviewer || !canaryApproval?.artifactPath ||
    !SHA.test(canaryApproval?.artifactBlobSha ?? "") || canaryApproval?.planOnly !== true ||
    canaryApproval?.reviewer === canaryPr?.author?.login) {
    errors.push("The canary does not carry a current native human approval for its immutable plan artifact.");
  }
  const expectedCanaryBinding = {
    sourceTaskId: contract.id,
    sourceContractDigest: contract.source.bodyDigest,
    sourcePlanDigest: planDigest(sourcePlan),
    sourceBaseSha: sourcePlan.baseSha,
    sourcePullRequest: Number(sourceRun?.pullRequest),
    sourceHeadSha: sourceRun?.headSha,
    sourceRunId: sourceRun?.runId,
    sourceRunAttempt: sourceRun?.runAttempt,
    sourceEvidenceRunId: String(evidenceRunId),
    bootstrapPlanPr: originalApproval?.planPr,
    bootstrapPlanHeadSha: originalApproval?.reviewedCommit,
    bootstrapReviewId: originalApproval?.reviewId,
    bootstrapReviewer: originalApproval?.reviewer,
  };
  if (!canaryFor || typeof canaryFor !== "object" ||
    Object.entries(expectedCanaryBinding).some(([key, value]) => canaryFor[key] !== value)) {
    errors.push("The canary plan does not bind the original task, approved plan, source PR/head, and source runs.");
  }
  if (errors.length > 0) throw new Error(errors.join(" "));

  return {
    schema: CANARY_SCHEMA,
    criterionIds: ["AC15"],
    verifiedAt: new Date().toISOString(),
    source: {
      repository,
      taskId: contract.id,
      contractDigest: contract.source.bodyDigest,
      planDigest: planDigest(sourcePlan),
      headSha: sourceRun.headSha,
      baseSha: sourceRun.baseSha,
      pullRequest: Number(sourceRun.pullRequest),
      runId: sourceRun.runId,
      runAttempt: sourceRun.runAttempt,
      evidenceRunId: String(evidenceRunId),
    },
    canary: {
      pullRequest: canaryPr.number,
      url: canaryPr.url,
      planAuthor: canaryPr.author.login,
      headSha: canaryPr.headRefOid,
      baseSha: canaryPr.baseRefOid,
      planDigest: canaryPlanValidation.planDigest,
      artifactPath: canaryApproval.artifactPath,
      artifactBlobSha: canaryApproval.artifactBlobSha,
      reviewId: canaryApproval.reviewId,
      reviewer: canaryApproval.reviewer,
      reviewedCommit: canaryApproval.reviewedCommit,
      reviewState: "APPROVED",
      approvedAt: canaryApproval.approvedAt,
      canaryFor,
    },
  };
}

function main() {
  if (process.env.GITHUB_WORKFLOW !== "System Maintenance Approval" ||
    process.env.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    throw new Error("The browser-plan-canary verifier runs only in protected System Maintenance Approval.");
  }
  const repository = process.env.GITHUB_REPOSITORY;
  const contract = loadTaskContract();
  const sourcePlan = readEvidenceJson("artifacts/approved-plan.json");
  const sourceRun = readEvidenceJson(SOURCE_RUN_PATH);
  const manifest = readEvidenceJson("artifacts/maintenance-manifest.json");
  const sourcePullRequest = Number(process.env.PR_NUMBER);
  const sourceHeadSha = process.env.NORTHSTAR_HEAD_SHA;
  const sourceRunId = process.env.NORTHSTAR_RUN_ID;
  const sourceRunAttempt = process.env.NORTHSTAR_RUN_ATTEMPT;
  const evidenceRunId = process.env.EVIDENCE_RUN_ID;
  const canaryPlanNumber = Number(process.env.CANARY_PLAN_PR_NUMBER);
  const canaryHeadSha = process.env.CANARY_PLAN_HEAD_SHA;
  if (!contract || !repository || !sourcePlan || !sourceRun || !manifest ||
    !positiveInteger(sourcePullRequest) || !SHA.test(sourceHeadSha ?? "") ||
    !isPositiveDecimal(sourceRunId) || !isPositiveDecimal(sourceRunAttempt) ||
    !isPositiveDecimal(evidenceRunId) || !positiveInteger(canaryPlanNumber) ||
    !SHA.test(canaryHeadSha ?? "")) {
    throw new Error("Task, source, maintenance, and canary identities are required.");
  }
  if (manifest.repository !== repository || Number(manifest.pullRequest) !== sourcePullRequest ||
    manifest.headSha !== sourceHeadSha || String(manifest.sourceRunId) !== sourceRunId ||
    String(manifest.evidenceRunId) !== evidenceRunId ||
    sourceRun.runId !== sourceRunId || sourceRun.runAttempt !== sourceRunAttempt ||
    sourceRun.headSha !== sourceHeadSha || Number(sourceRun.pullRequest) !== sourcePullRequest) {
    throw new Error("The source run and maintenance manifest are not bound to the requested implementation PR.");
  }
  const sourcePull = githubJson(`repos/${repository}/pulls/${sourcePullRequest}`);
  if (!SHA.test(sourceRun.baseSha ?? "") ||
      !SHA.test(sourcePull.merge_commit_sha ?? "")) {
    throw new Error("The original task base and merge commit must be immutable SHA values.");
  }
  const sourceMergeComparison = githubJson(
    `repos/${repository}/compare/${sourceRun.baseSha}...${sourcePull.merge_commit_sha}`,
  );
  const sourceRunInfo = githubJson(`repos/${repository}/actions/runs/${sourceRunId}`);
  const evidenceRunInfo = githubJson(`repos/${repository}/actions/runs/${evidenceRunId}`);
  const canarySelection = fetchApprovedPlan(contract, { planPrNumber: canaryPlanNumber });
  const evidence = buildBrowserPlanCanaryEvidence({
    repository,
    contract,
    sourcePlan,
    sourceRun,
    sourcePull,
    sourceMergeComparison,
    sourceRunInfo,
    evidenceRunInfo,
    evidenceRunId,
    canarySelection,
    canaryPlanNumber,
    canaryHeadSha,
  });
  const artifact = evidencePath("artifacts/browser-plan-canary.json");
  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(artifact, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const record = createCheckRecord({
    id: "browser-plan-canary",
    category: "approval",
    status: "pass",
    summary: "A protected verifier confirmed the current native plan review and its binding to the original Issue 14 implementation.",
    artifact: "artifacts/browser-plan-canary.json",
  }, { ...process.env, NORTHSTAR_JOB_ID: "browser-plan-canary" }, {
    contract,
    plan: sourcePlan,
  });
  writeCheckRecord(record);
  process.stdout.write(`browser-plan-canary=pass source_pr=${sourcePullRequest} source_head=${sourceHeadSha} canary_pr=${canaryPlanNumber} canary_head=${canaryHeadSha}\n`);
}

const invokedDirectly = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Browser plan canary verification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}