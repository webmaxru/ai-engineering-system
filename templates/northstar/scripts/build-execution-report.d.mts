import type { CheckRecord, EvidenceContext } from "./evidence-record.d.mts";
import type { DeferredCriterion, PlanContract } from "./plan-contract.d.mts";
import type {
  SuccessCriterion,
  TaskContract,
} from "./task-contract.d.mts";

export interface JUnitEvidence {
  present: boolean;
  path: string;
  digest?: string | null;
  tests?: number;
  failures?: number;
  errors?: number;
  skipped?: number;
  passed?: boolean;
  testNames?: string[];
  skippedTestNames?: string[];
  validationErrors?: string[];
}

export interface ExecutionReport {
  schema: "northstar/execution-report/4";
  workItem: string;
  contractSource: TaskContract["source"];
  generatedAt: string;
  validationLevel: "local-reference" | "hosted-integration";
  provenance: EvidenceContext;
  contextErrors: string[];
  plan: {
    present: boolean;
    valid: boolean;
    errors: string[];
    schema?: string;
    risk?: string;
    digest?: string;
    contractDigest?: string;
    baseSha?: string;
  };
  tests: { unit: JUnitEvidence; acceptance: JUnitEvidence };
  checks: Array<{
    id: string;
    hostedOnly: boolean;
    present: boolean;
    status: string;
    valid: boolean;
    reasons: string[];
    record: CheckRecord | null;
  }>;
  successCriteria: Array<SuccessCriterion & { proven: boolean }>;
  failedLocalChecks: string[];
  pendingHostedEvidence: string[];
  unprovenCriteria: string[];
  deferredCriteria: Array<DeferredCriterion & { status: "unverified" | "proven" }>;
  decision: "review_required" | "ready_for_review" | "ready_for_acceptance";
  limits: string[];
}

export declare function parseJUnit(
  xml: string,
  relativePath?: string,
): JUnitEvidence;
export declare function readJUnit(relativePath: string, root?: string): JUnitEvidence;
export declare function criterionCoverage(
  criteria: SuccessCriterion[],
  testNames: string[],
): Array<SuccessCriterion & { proven: boolean }>;
export declare function loadCheckRecords(directory?: string, root?: string): CheckRecord[];
export declare function buildExecutionReport(input: {
  contract: TaskContract;
  plan: PlanContract | null;
  records: CheckRecord[];
  unit: JUnitEvidence;
  acceptance: JUnitEvidence;
  hosted: boolean;
  env?: Record<string, string | undefined>;
  root?: string;
}): ExecutionReport;
export declare function checkFailureDiagnostics(
  checks: Array<Pick<ExecutionReport["checks"][number], "id" | "status" | "reasons">>,
  failedIds: string[],
): string[];
