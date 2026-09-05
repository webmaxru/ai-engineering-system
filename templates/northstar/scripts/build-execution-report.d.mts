import type { CheckRecord } from "./evidence-record.d.mts";
import type { PlanContract } from "./plan-contract.d.mts";
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
}

export declare function parseJUnit(
  xml: string,
  relativePath?: string,
): JUnitEvidence;
export declare function readJUnit(relativePath: string): JUnitEvidence;
export declare function criterionCoverage(
  criteria: SuccessCriterion[],
  testNames: string[],
): Array<SuccessCriterion & { proven: boolean }>;
export declare function loadCheckRecords(directory?: string): CheckRecord[];
export declare function buildExecutionReport(input: {
  contract: TaskContract;
  plan: PlanContract | null;
  records: CheckRecord[];
  unit: JUnitEvidence;
  acceptance: JUnitEvidence;
  hosted: boolean;
  env?: Record<string, string | undefined>;
}): Record<string, unknown>;
