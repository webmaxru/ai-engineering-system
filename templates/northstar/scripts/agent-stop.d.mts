export interface ExecutionReportLike {
  decision: string;
  successCriteria: Array<{ id: string; proven: boolean }>;
  deferredCriteria?: Array<{ id: string; status: "unverified" | "proven" }>;
  tests: {
    unit: { tests?: number; failures?: number; errors?: number };
    acceptance: { tests?: number; failures?: number; errors?: number };
  };
}

export declare function summarize(data: ExecutionReportLike | null): string;

export interface StopGateOutput {
  continue?: boolean;
  stopReason?: string;
  systemMessage: string;
  decision?: "block";
  reason?: string;
  hookSpecificOutput?: {
    hookEventName: "Stop";
    decision: "block";
    reason: string;
  };
}

export interface StopCommandContext {
  cwd: string;
  env: Record<string, string | undefined>;
}

export declare function runStopGate(
  input: unknown,
  options?: {
    root?: string;
    env?: Record<string, string | undefined>;
    run?: (command: string, context: StopCommandContext) => { ok: boolean; output: string };
  },
): StopGateOutput;
