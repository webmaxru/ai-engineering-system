export interface AuditRecord {
  schema: "northstar/agent-audit/1";
  id: string;
  timestamp: string | number;
  event: string;
  sessionId: string | null;
  taskId: string | null;
  contractDigest: string | null;
  planDigest: string | null;
  tool: string | null;
  paths: string[];
  commandDigest: string | null;
  argumentsDigest: string;
  resultDigest: string | null;
  success: boolean;
}

export declare function createAuditRecord(
  payload: Record<string, unknown>,
  now?: string,
): AuditRecord;
export declare function writeAuditRecord(record: AuditRecord, out?: string): string;
