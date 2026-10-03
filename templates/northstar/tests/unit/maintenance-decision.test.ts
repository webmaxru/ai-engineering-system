import { describe, expect, it } from "vitest";
import {
  validateMaintenanceDecision,
  type MaintenanceDecisionReport,
} from "../../scripts/validate-maintenance-decision.mjs";

function report(): MaintenanceDecisionReport {
  return {
    workItem: "AES-SURFACE-EVIDENCE",
    validationLevel: "hosted-integration",
    decision: "ready_for_review",
    plan: { present: true, valid: true, errors: [] },
    tests: {
      unit: { present: true, path: "artifacts/unit-junit.xml", tests: 100, passed: true },
      acceptance: { present: true, path: "artifacts/acceptance-junit.xml", tests: 10, passed: true },
    },
    contextErrors: [],
    failedLocalChecks: [],
    pendingHostedEvidence: ["browser-plan-canary"],
    unprovenCriteria: ["AC15"],
    deferredCriteria: [{
      id: "AC15",
      stage: "post-acceptance",
      reason: "The canary runs after controlled bootstrap activation.",
      evidence: "Bind the native review to the original task and implementation.",
      status: "unverified",
    }],
    successCriteria: [
      { id: "AC1", statement: "Other work is proven.", provenBy: "test", proven: true },
      { id: "AC15", statement: "Browser canary is proven.", provenBy: "review", proven: false },
    ],
    checks: [{
      id: "browser-plan-canary",
      hostedOnly: true,
      present: false,
      status: "not-run",
      valid: false,
      reasons: ["missing"],
      record: null,
    }],
  };
}

describe("protected maintenance report gate", () => {
  it("allows only the exact AC15 staged report before the canary is requested", () => {
    expect(validateMaintenanceDecision(report())).toMatchObject({
      ok: true,
      mode: "staged-review",
    });
    expect(validateMaintenanceDecision(report(), { canaryRequested: true })).toMatchObject({
      ok: false,
      mode: "blocked",
    });
  });

  it("does not stage through other failed evidence or a failed canary record", () => {
    const withOtherFailure = report();
    withOtherFailure.pendingHostedEvidence = ["browser-plan-canary", "repository-controls"];
    expect(validateMaintenanceDecision(withOtherFailure).ok).toBe(false);

    const failedCanary = report();
    failedCanary.checks[0] = {
      ...failedCanary.checks[0]!,
      present: true,
      status: "fail",
      reasons: ["review does not bind current head"],
    };
    expect(validateMaintenanceDecision(failedCanary).ok).toBe(false);
  });

  it("requires a trusted current canary record before accepting deferred AC15", () => {
    const final = report();
    final.decision = "ready_for_acceptance";
    final.pendingHostedEvidence = [];
    final.unprovenCriteria = [];
    final.deferredCriteria = final.deferredCriteria.map((criterion) => ({
      ...criterion,
      status: "proven",
    }));
    final.successCriteria = final.successCriteria.map((criterion) => ({
      ...criterion,
      proven: true,
    }));
    final.checks[0] = {
      ...final.checks[0]!,
      present: true,
      status: "pass",
      valid: true,
      reasons: [],
      record: {
        id: "browser-plan-canary",
        provenance: {
          workflow: "System Maintenance Approval",
          event: "workflow_dispatch",
          job: "browser-plan-canary",
        },
      },
    };
    expect(validateMaintenanceDecision(final, { canaryRequested: true })).toMatchObject({
      ok: true,
      mode: "accepted",
    });

    final.checks[0] = { ...final.checks[0]!, record: null };
    expect(validateMaintenanceDecision(final).ok).toBe(false);

    const nonDeferredAc15 = report();
    nonDeferredAc15.decision = "ready_for_acceptance";
    nonDeferredAc15.pendingHostedEvidence = [];
    nonDeferredAc15.unprovenCriteria = [];
    nonDeferredAc15.deferredCriteria = [];
    nonDeferredAc15.successCriteria = nonDeferredAc15.successCriteria.map((criterion) => ({
      ...criterion,
      proven: true,
    }));
    expect(validateMaintenanceDecision(nonDeferredAc15).ok).toBe(false);
  });
});
