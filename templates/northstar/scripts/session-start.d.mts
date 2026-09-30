export interface IssueResolution {
  /** The issue that defines the active task, or null when none was identified. */
  number: number | null;
  /** How it was identified, for the injected session context. */
  how: string;
}

export interface UnselectedTaskStateCleanup {
  status: "cleared" | "released" | "preserved";
  reason?: string;
}

export declare function resolveIssueNumber(options?: {
  env?: Record<string, string | undefined>;
  payload?: {
    initial_prompt?: string;
    initialPrompt?: string;
    session_id?: string;
    sessionId?: string;
  };
}): IssueResolution;

export declare function clearUnselectedTaskState(options?: {
  root?: string;
  sessionId?: string | null;
  env?: Record<string, string | undefined>;
}): Promise<UnselectedTaskStateCleanup>;