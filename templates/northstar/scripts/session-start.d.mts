export interface IssueResolution {
  /** The issue that defines the active task, or null when none was identified. */
  number: number | null;
  /** How it was identified, for the injected session context. */
  how: string;
}

export declare function resolveIssueNumber(options?: {
  env?: Record<string, string | undefined>;
}): IssueResolution;