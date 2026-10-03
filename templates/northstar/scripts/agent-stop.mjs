/**
 * A real Stop invocation spends one persisted repair attempt. Unit-test runs
 * do not. Only a successful current evidence command and its exact local
 * report can close the loop; repeated or unsafe failures stop automation.
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";
import {
  createCheckRecord, digestPath, evidenceContext, evidencePath,
  hasLiveTaskIdentity, readEvidenceJson, writeCheckRecord,
} from "./evidence-record.mjs";
import { buildExecutionReport, loadCheckRecords, readJUnit } from "./build-execution-report.mjs";
import { failureEvidence, runStopAttempt } from "./repair-budget.mjs";
import { planDigest, validatePlanContract } from "./plan-contract.mjs";
import { planArtifactPath } from "./plan-artifact.mjs";
import { approvalPolicyForRisk, GOVERNANCE_POLICY } from "./risk-policy.mjs";
import {
  assertWorkspaceOwner,
  readWorkspaceOwner,
  workspaceOwnerIdentity,
} from "./workspace-owner.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function run(command, { cwd, env }) {
  try {
    return { ok: true, output: execSync(command, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    const detail = `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim();
    return { ok: false, output: detail || error.message };
  }
}

function requireApprovedPlan(contract, plan, repository) {
  if (!hasLiveTaskIdentity(contract, repository)) {
    throw new Error("No trusted live task contract is active. Fixture data is not Stop authority.");
  }
  const validation = validatePlanContract(plan, contract);
  if (!validation.ok || plan.planDigest !== planDigest(plan)) {
    throw new Error(`The machine-readable plan is invalid: ${validation.errors.join("; ") || "canonical plan digest missing"}`);
  }
  if (!approvalPolicyForRisk(plan.risk).requirePlanOnlyApproval) return;
  const approval = plan.approval;
  if (!approval || approval.taskId !== contract.id ||
    approval.contractDigest !== contract.source.bodyDigest ||
    approval.planDigest !== plan.planDigest || approval.baseSha !== plan.baseSha ||
    approval.planOnly !== true || !Number.isSafeInteger(approval.reviewId) || approval.reviewId < 1 ||
    !Number.isSafeInteger(approval.planPr) || approval.planPr < 1 ||
    !/^[0-9a-f]{40}$/.test(approval.reviewedCommit ?? "") ||
    !Number.isFinite(Date.parse(approval.approvedAt)) || Date.parse(approval.approvedAt) > Date.now() ||
    !GOVERNANCE_POLICY.planApproval.reviewers.includes(approval.reviewer) ||
    approval.planUrl !== `https://github.com/${repository}/pull/${approval.planPr}`) {
    throw new Error("The cached human plan approval is missing, malformed, or bound to different inputs.");
  }
  if (approval.schema === "northstar/plan-approval/2") {
    if (approval.source !== "github-review" || approval.repository !== repository ||
      approval.artifactPath !== planArtifactPath(contract.id) ||
      !/^[0-9a-f]{40}$/.test(approval.artifactBlobSha ?? "")) {
      throw new Error("The native approval does not bind the immutable task plan artifact.");
    }
  } else if (approval.schema !== "northstar/plan-approval/1" ||
    approval.commentAuthor !== approval.reviewer ||
    !GOVERNANCE_POLICY.planApproval.legacyPlans.some((legacy) =>
      legacy.repository === repository && legacy.pr === approval.planPr &&
      legacy.headSha === approval.reviewedCommit && legacy.baseSha === plan.baseSha &&
      legacy.contractDigest === plan.contractDigest && legacy.planDigest === plan.planDigest)) {
    throw new Error("The legacy approval is not the explicitly pinned bootstrap approval.");
  }
}

export function summarize(data) {
  if (!data) return "no execution report was produced";
  if (!Array.isArray(data.successCriteria) || !data.tests?.unit || !data.tests?.acceptance) {
    return "invalid execution report";
  }
  const proven = data.successCriteria.filter((criterion) => criterion.proven).length;
  const deferredCriteria = Array.isArray(data.deferredCriteria)
    ? data.deferredCriteria.filter(({ status }) => status === "unverified").map(({ id }) => id)
    : [];
  return [
    data.decision,
    `criteria ${proven}/${data.successCriteria.length}`,
    ...(deferredCriteria.length > 0
      ? [`deferred ${deferredCriteria.join(", ")} (unverified)`]
      : []),
    `unit ${data.tests.unit.tests ?? 0} tests, ${(data.tests.unit.failures ?? 0) + (data.tests.unit.errors ?? 0)} failed`,
    `acceptance ${data.tests.acceptance.tests ?? 0} tests, ${(data.tests.acceptance.failures ?? 0) + (data.tests.acceptance.errors ?? 0)} failed`,
  ].join(" | ");
}

function escalation(reason) {
  return {
    continue: false,
    stopReason: `Stop validation requires human escalation: ${reason}. Completion was not verified.`,
    systemMessage: "Evidence gate did not pass. Stop automatic repair and retain the evidence for human review.",
  };
}

function readStopSession(input, contract, root, env) {
  const session = readEvidenceJson("artifacts/task-session.json", root);
  if (!session || !["plan", "implement", null].includes(session.role)) {
    throw new Error("Explicit task-session role metadata is missing or invalid; resolve the task again.");
  }
  if (session.taskId !== contract?.id ||
    session.contractDigest !== contract?.source?.bodyDigest ||
    !Number.isSafeInteger(session.issue) || session.issue !== contract?.source?.issue) {
    throw new Error("Task-session metadata does not match the current task contract.");
  }
  const ids = [input.session_id, input.sessionId].filter((id) => id !== undefined);
  if (ids.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(ids).size > 1 ||
    typeof session.sessionId !== "string" || !session.sessionId.trim() ||
    session.sessionId !== ids[0]) {
    throw new Error("Stop session identity is missing, invalid, or different from the resolved task session.");
  }
  const repository = env.GITHUB_REPOSITORY ??
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/\d+$/.exec(contract?.source?.url ?? "")?.[1];
  const owner = readWorkspaceOwner(root);
  if (!repository || !owner ||
      session.workspaceOwner !== owner.ownerKey ||
      owner.repository !== repository ||
      owner.issue !== session.issue ||
      owner.taskId !== session.taskId ||
      owner.contractDigest !== session.contractDigest) {
    throw new Error("Stop requires a matching task, session, and repository workspace owner.");
  }
  const expectedOwner = workspaceOwnerIdentity({
    root,
    issue: session.issue,
    taskId: session.taskId,
    contractDigest: session.contractDigest,
    sessionId: session.sessionId,
    env: { ...env, GITHUB_REPOSITORY: repository },
    contract,
  });
  assertWorkspaceOwner(root, expectedOwner);
  return session;
}

export function runStopGate(input, { root = REPO_ROOT, env = process.env, run: execute = run } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    typeof input.stop_hook_active !== "boolean" ||
    (input.hook_event_name && !["Stop", "SubagentStop"].includes(input.hook_event_name))) {
    return escalation("malformed or non-Stop hook input; no validation attempt was started");
  }
  let canonicalReport;
  let session;
  const invalidateReport = () => {
    if (canonicalReport && isDeepStrictEqual(
      readEvidenceJson("artifacts/task-session.json", root), session,
    )) rmSync(canonicalReport, { force: true });
  };
  try {
    const contract = readEvidenceJson("artifacts/task-contract.json", root);
    session = readStopSession(input, contract, root, env);
    if (session.role !== "implement") {
      return {
        systemMessage: `Implementation evidence gate did not run for ${session.role ?? "unassigned"} role. No completion was verified and no Stop attempt was spent.`,
      };
    }
    canonicalReport = evidencePath("artifacts/report.json", root);
    invalidateReport();
    const plan = readEvidenceJson("artifacts/plan.json", root);
    const repository = env.GITHUB_REPOSITORY ??
      /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/\d+$/.exec(contract?.source?.url ?? "")?.[1];
    requireApprovedPlan(contract, plan, repository);
    const approved = readEvidenceJson("artifacts/approved-plan.json", root);
    if (approvalPolicyForRisk(plan.risk).requirePlanOnlyApproval && !approved) {
      throw new Error("The verified approved-plan cache is missing; resolve the task again.");
    }
    if (approved && (planDigest(approved) !== plan.planDigest || !isDeepStrictEqual(approved.approval, plan.approval))) {
      throw new Error("The cached approved plan differs from the active plan; refresh task authority.");
    }
    const assertCurrentAuthority = () => {
      const currentContract = readEvidenceJson("artifacts/task-contract.json", root);
      const currentSession = readStopSession(input, currentContract, root, env);
      const currentPlan = readEvidenceJson("artifacts/plan.json", root);
      const currentApproved = readEvidenceJson("artifacts/approved-plan.json", root);
      if (!isDeepStrictEqual(currentSession, session) ||
        currentContract?.id !== contract.id || currentContract?.source?.bodyDigest !== contract.source.bodyDigest ||
        !isDeepStrictEqual(currentPlan, plan) || !isDeepStrictEqual(currentApproved, approved)) {
        throw new Error("Policy failure: task, session, plan, or approval changed during Stop validation.");
      }
      requireApprovedPlan(currentContract, currentPlan, repository);
    };
    const localEnv = {
      ...env, GITHUB_REPOSITORY: repository,
      GITHUB_ACTIONS: "false", GITHUB_RUN_ID: undefined, GITHUB_RUN_ATTEMPT: undefined,
      GITHUB_WORKFLOW: "local", GITHUB_EVENT_NAME: "local", GITHUB_ACTOR: "local",
      NORTHSTAR_RUN_ID: undefined, NORTHSTAR_RUN_ATTEMPT: undefined,
      NORTHSTAR_HEAD_SHA: undefined, GITHUB_SHA: undefined, BASE_SHA: plan.baseSha,
      NORTHSTAR_JOB_ID: undefined, GITHUB_JOB: undefined,
    };
    const context = evidenceContext(localEnv, { root, contract, plan });
    const recovery = runStopAttempt({ ...context, sessionId: session.sessionId }, (attempt) => {
      const validationEnv = {
        ...localEnv,
        NORTHSTAR_RUN_ID: `local-stop-${attempt.id}`,
        NORTHSTAR_RUN_ATTEMPT: String(attempt.number),
        NORTHSTAR_HEAD_SHA: context.headSha,
        NORTHSTAR_VALIDATION_STARTED_AT: attempt.startedAt,
      };
      const failures = [];
      const gaps = [];
      const checks = [];
      const reportPath = `artifacts/stop-reports/${attempt.id}.json`;
      const result = () => ({
        failures, gaps, checks, reportPath,
        reportDigest: digestPath(reportPath, root),
        summary: "no current passing execution report",
      });
      const record = (id, commandResult, artifact, category) => {
        let effective = commandResult;
        let record;
        try {
          record = createCheckRecord({
            id, category, status: effective.ok ? "pass" : "fail", artifact,
          }, validationEnv, { root, contract, plan });
        } catch (error) {
          effective = { ok: false, output: `${id} evidence unavailable: ${error.message}` };
          record = createCheckRecord({ id, category, status: "fail", artifact }, validationEnv, { root, contract, plan });
        }
        writeCheckRecord(record, undefined, root);
        if (!effective.ok) {
          failures.push(failureEvidence({ check: id, message: effective.output }));
          gaps.push(`${id} failed; its passing evidence was not accepted`);
        }
      };
      record("plan-contract", { ok: true, output: "" }, "artifacts/plan.json", "policy");
      const commands = [
        ["quality", "npm run instructions:check && npm run lint && npm run typecheck && npm run build && npm run test:unit:ci", "artifacts/unit-junit.xml", "execution"],
        ["acceptance", "npm run test:acceptance:ci", "artifacts/acceptance-junit.xml", "execution"],
        ["dependency-review", "npm audit --audit-level=high --json > artifacts/dependency-audit.json", "artifacts/dependency-audit.json", "security"],
        ["secret-scan", "npm run security:secrets", null, "security"],
        ["governance-policy", "npm run governance:check", "artifacts/governance-report.json", "policy"],
        ["scope-policy", `npm run scope:check -- --base ${plan.baseSha}`, "artifacts/scope-report.json", "policy"],
        ["merge-validation", `node scripts/check-merge.mjs --base ${plan.baseSha}`, "artifacts/merge-report.json", "policy"],
      ];
      for (const [id, command, artifact, category] of commands) {
        assertCurrentAuthority();
        if (artifact) rmSync(evidencePath(artifact, root), { force: true });
        checks.push(id);
        const commandResult = execute(command, { cwd: root, env: validationEnv });
        if (typeof commandResult?.ok !== "boolean" || typeof commandResult.output !== "string") {
          throw new Error(`Invalid command result for ${id}.`);
        }
        assertCurrentAuthority();
        record(id, commandResult, artifact, category);
        if (failures.some(({ action }) => action === "escalate")) return result();
      }
      checks.push("evidence");
      const evidenceStartedAt = Date.now();
      const evidence = execute(`npm run evidence -- --out ${reportPath}`, { cwd: root, env: validationEnv });
      assertCurrentAuthority();
      if (evidence?.ok !== true) {
        gaps.push("evidence command failed; previous reports cannot satisfy this Stop");
        if (failures.length === 0) {
          failures.push(failureEvidence({ check: "evidence", message: evidence?.output ?? "unknown evidence command failure" }));
        }
        return result();
      }
      if (failures.length > 0) return result();
      const data = readEvidenceJson(reportPath, root);
      const current = buildExecutionReport({
        contract, plan, records: loadCheckRecords("artifacts/checks", root),
        unit: readJUnit("artifacts/unit-junit.xml", root),
        acceptance: readJUnit("artifacts/acceptance-junit.xml", root),
        hosted: false, env: validationEnv, root,
      });
      if (!data || data.decision !== "ready_for_review" ||
        data.validationLevel !== "local-reference" ||
        !Number.isFinite(Date.parse(data.generatedAt)) ||
        Date.parse(data.generatedAt) < evidenceStartedAt || Date.parse(data.generatedAt) > Date.now() ||
        !isDeepStrictEqual({ ...data, generatedAt: null }, { ...current, generatedAt: null })) {
        failures.push(failureEvidence({ check: "evidence", message: "execution report missing, stale, malformed, or mismatched to current validation" }));
        gaps.push("the exact current local execution report was not verified");
        return result();
      }
      return { ...result(), summary: summarize(data) };
    }, { root });
    const attempted = `${recovery.attempts.length}/3 Stop attempts`;
    if (recovery.decision === "escalate") {
      invalidateReport();
      return escalation(`${recovery.reason}; ${attempted}; recovery evidence: ${recovery.path}`);
    }
    if (recovery.decision === "proceed") {
      assertCurrentAuthority();
      const reportPath = recovery.outcome.reportPath;
      if (!reportPath || digestPath(reportPath, root) !== recovery.outcome.reportDigest) {
        throw new Error("Current execution report changed before Stop publication.");
      }
      mkdirSync(dirname(canonicalReport), { recursive: true });
      writeFileSync(canonicalReport, readFileSync(evidencePath(reportPath, root)));
      return { systemMessage: `Evidence gate passed: ${recovery.outcome.summary}. ${attempted}. Report at artifacts/report.json. Hosted acceptance remains separate.` };
    }
    invalidateReport();
    const reason = `The evidence does not support "done": ${(recovery.outcome?.gaps ?? []).join("; ")}. ` +
      `${recovery.reason}; ${recovery.remainingAttempts} Stop attempts remain. Fix the cause without weakening assertions.`;
    return input.hook_event_name === "SubagentStop"
      ? { decision: "block", reason, systemMessage: `Evidence gate blocked completion; ${attempted}.` }
      : {
          hookSpecificOutput: { hookEventName: "Stop", decision: "block", reason },
          systemMessage: `Evidence gate blocked completion; ${attempted}. Recovery evidence: ${recovery.path}`,
        };
  } catch (error) {
    let reason = error.message;
    if (canonicalReport) {
      try {
        invalidateReport();
      } catch (cleanupError) {
        reason += `; the old report could not be invalidated (${cleanupError.code}) and must not be used`;
      }
    }
    return escalation(reason);
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    process.stdout.write(`${JSON.stringify(escalation("malformed Stop JSON; no attempt was started"))}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(runStopGate(payload), null, 2)}\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) await main();
