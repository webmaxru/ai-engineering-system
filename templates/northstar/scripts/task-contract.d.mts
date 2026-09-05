export interface TaskScope {
  allowed: string[];
  prohibited: string[];
}

export interface ContractSource {
  /** For example `issue #12` or `fixture file tests/fixtures/WI-1842.issue.md`. */
  kind: string;
  issue: number | null;
  url: string | null;
  actor: string | null;
  association: string | null;
  trusted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  bodyDigest: string;
  resolvedAt: string;
}

/** Learn's "Inputs": what the agent needs. */
export interface TaskInputs {
  goal: string;
  authoritativeSources: string[];
  scope: TaskScope;
  constraints: string[];
  nonGoals: string[];
  validationExpectations: string[];
  rolloutExpectations: string[];
}

/** Learn's "Outputs": what the agent produces. */
export interface TaskOutput {
  id: string;
  description: string;
}

/** Learn's "Success criteria": how results are evaluated. */
export interface SuccessCriterion {
  id: string;
  statement: string;
  provenBy: string;
}

/**
 * Parsed from the issue that defines the task. Inputs / Outputs / Success
 * criteria follow Microsoft Learn; `stopConditions` is this repository's
 * extension.
 */
export interface TaskContract {
  schema: string;
  id: string;
  title: string;
  source: ContractSource;
  inputs: TaskInputs;
  outputs: TaskOutput[];
  successCriteria: SuccessCriterion[];
  stopConditions: string[];
}

export declare const CONTRACT_CACHE: string;
export declare const DEFAULT_SCOPE: TaskScope;

export declare function splitSections(body: string): Record<string, string>;

export declare function parseIssueBody(
  body: string,
  origin?: {
    number?: number;
    url?: string;
    source?: string;
    actor?: string;
    association?: string;
    trusted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  },
): TaskContract;

export declare function contractFromIssue(issueNumber: string | number): TaskContract;

export declare function contractFromFile(path: string): TaskContract;

export declare function cacheContract(contract: TaskContract, cachePath?: string): string;

export declare function loadTaskContract(cachePath?: string): TaskContract | null;

export declare function taskScope(contract?: TaskContract | null): TaskScope;

export declare function scopePrefixes(scope?: TaskScope): string[];

export declare function isPathPattern(entry: string): boolean;

export declare function splitProhibitions(scope?: TaskScope): {
  /** Prohibitions a path check enforces. These beat the allowed scope. */
  paths: string[];
  /** Prohibitions stated in prose. Reviewer guidance, not enforced. */
  advisory: string[];
};

export declare function matchesPattern(filePath: string, pattern: string): boolean;
export declare function isPathAllowed(filePath: string, scope: TaskScope): boolean;