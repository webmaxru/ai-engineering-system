export interface AuditRecord {
  schema: "northstar/agent-audit/1";
  id: string;
  timestamp: string | number;
  event: string;
  sessionId: string | null;
  taskId: string | null;
  contractDigest: string | null;
  planDigest: string | null;
  workspaceOwnerVerified: boolean;
  tool: string | null;
  paths: string[];
  commandDigest: string | null;
  argumentsDigest: string;
  resultDigest: string | null;
  success: boolean | null;
}

export declare function createAuditRecord(
  payload: Record<string, unknown>,
  now?: string,
  root?: string,
  env?: Record<string, string | undefined>,
): AuditRecord;
export declare function writeAuditRecord(
  record: AuditRecord,
  out?: string | null,
  root?: string,
): string;
