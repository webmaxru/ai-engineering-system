import { pathToFileURL } from "node:url";
import { readEvidenceJson } from "./evidence-record.mjs";

function passingTestSuite(suite) {
  return suite?.passed === true && Number.isSafeInteger(suite.tests) && suite.tests > 0;
}

export function validateMaintenanceDecision(report, { canaryRequested = false } = {}) {
  const arrays = [
    report?.contextErrors,
    report?.failedLocalChecks,
    report?.pendingHostedEvidence,
    report?.unprovenCriteria,
    report?.deferredCriteria,
    report?.successCriteria,
    report?.checks,
  ];
  if (arrays.some((value) => !Array.isArray(value)) ||
      !passingTestSuite(report?.tests?.unit) ||
      !passingTestSuite(report?.tests?.acceptance)) {
    return { ok: false, mode: "blocked", reason: "The report is incomplete or its test evidence is not passing." };
  }

  const requiresAc15Canary = report.workItem === "AES-SURFACE-EVIDENCE" &&
    report.successCriteria.some(({ id }) => id === "AC15");
  const canaryChecks = report.checks.filter(({ id }) => id === "browser-plan-canary");
  const canaryProven = !requiresAc15Canary || (
    canaryChecks.length === 1 &&
    canaryChecks[0].present === true &&
    canaryChecks[0].status === "pass" &&
    canaryChecks[0].valid === true &&
    canaryChecks[0].record?.id === "browser-plan-canary" &&
    canaryChecks[0].record?.provenance?.workflow === "System Maintenance Approval" &&
    canaryChecks[0].record?.provenance?.event === "workflow_dispatch" &&
    canaryChecks[0].record?.provenance?.job === "browser-plan-canary"
  );
  const finalAcceptance =
    report.decision === "ready_for_acceptance" &&
    report.plan?.valid === true &&
    report.contextErrors.length === 0 &&
    report.failedLocalChecks.length === 0 &&
    report.pendingHostedEvidence.length === 0 &&
    report.unprovenCriteria.length === 0 &&
    report.deferredCriteria.every(({ status }) => status === "proven") &&
    canaryProven;
  if (finalAcceptance) {
    return { ok: true, mode: "accepted", reason: "All required evidence, including the browser canary, is proven." };
  }

  if (canaryRequested) {
    return {
      ok: false,
      mode: "blocked",
      reason: "A requested canary must produce ready_for_acceptance; staged review is not sufficient.",
    };
  }

  const ac15 = report.successCriteria.filter(({ id }) => id === "AC15");
  const otherCriteria = report.successCriteria.filter(({ id }) => id !== "AC15");
  const ac15Deferral = report.deferredCriteria.filter(({ id }) => id === "AC15");
  const stagedReview =
    report.workItem === "AES-SURFACE-EVIDENCE" &&
    report.validationLevel === "hosted-integration" &&
    report.decision === "ready_for_review" &&
    report.plan?.valid === true &&
    report.contextErrors.length === 0 &&
    report.failedLocalChecks.length === 0 &&
    report.pendingHostedEvidence.length === 1 &&
    report.pendingHostedEvidence[0] === "browser-plan-canary" &&
    report.unprovenCriteria.length === 1 &&
    report.unprovenCriteria[0] === "AC15" &&
    ac15.length === 1 && ac15[0].proven === false &&
    otherCriteria.length > 0 && otherCriteria.every(({ proven }) => proven === true) &&
    ac15Deferral.length === 1 &&
    ac15Deferral[0].stage === "post-acceptance" &&
    ac15Deferral[0].status === "unverified" &&
    canaryChecks.length === 1 &&
    canaryChecks[0].present === false &&
    canaryChecks[0].status === "not-run" &&
    canaryChecks[0].reasons.length === 1 &&
    canaryChecks[0].reasons[0] === "missing";
  return stagedReview
    ? { ok: true, mode: "staged-review", reason: "Only the explicitly deferred AC15 browser canary remains." }
    : { ok: false, mode: "blocked", reason: "The report does not meet final acceptance or the exact AC15 staged-review gate." };
}

function main() {
  const report = readEvidenceJson("artifacts/report.json");
  if (!report) throw new Error("Execution report is missing.");
  const canaryRequested = Boolean(
    process.env.CANARY_PLAN_PR_NUMBER || process.env.CANARY_PLAN_HEAD_SHA,
  );
  const decision = validateMaintenanceDecision(report, { canaryRequested });
  if (!decision.ok) throw new Error(decision.reason);
  process.stdout.write(`maintenance-decision=${decision.mode}: ${decision.reason}\n`);
}

const invokedDirectly = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Maintenance decision failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
