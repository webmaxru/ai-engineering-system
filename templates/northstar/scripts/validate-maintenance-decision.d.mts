import type { ExecutionReport } from "./build-execution-report.d.mts";

export type MaintenanceDecisionReport = Omit<
  Pick<
    ExecutionReport,
    | "workItem"
    | "validationLevel"
    | "decision"
    | "plan"
    | "tests"
    | "contextErrors"
    | "failedLocalChecks"
    | "pendingHostedEvidence"
    | "unprovenCriteria"
    | "deferredCriteria"
    | "checks"
    | "successCriteria"
  >,
  "checks"
> & {
  checks: Array<{
    id: string;
    hostedOnly: boolean;
    present: boolean;
    status: string;
    valid: boolean;
    reasons: string[];
    record: {
      id: string;
      provenance: { workflow: string; event: string; job: string };
    } | null;
  }>;
};

export declare function validateMaintenanceDecision(
  report: MaintenanceDecisionReport,
  options?: { canaryRequested?: boolean },
): {
  ok: boolean;
  mode: "accepted" | "staged-review" | "blocked";
  reason: string;
};
