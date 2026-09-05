export interface ExecutionReportLike {
  decision: string;
  successCriteria: Array<{ id: string; proven: boolean }>;
  tests: {
    unit: { tests?: number; failures?: number; errors?: number };
    acceptance: { tests?: number; failures?: number; errors?: number };
  };
}

export declare function summarize(data: ExecutionReportLike | null): string;
