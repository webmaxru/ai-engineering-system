export type PermissionDecision = "allow" | "deny" | "ask";

export interface ToolCall {
  /** GitHub cloud agent and Copilot CLI. */
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  /** VS Code. */
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
}

export interface TaskScope {
  allowed: string[];
  prohibited?: string[];
}

export interface AuthorizationContext {
  scope?: TaskScope;
  taskId?: string;
  trustedContract?: boolean;
  approvedPlan?: boolean;
  branchAuthorized?: boolean;
  planScope?: TaskScope;
}

export interface AuthorizationDecision {
  permissionDecision: PermissionDecision;
  permissionDecisionReason: string;
}

export declare const WRITABLE_PATH_PREFIXES: readonly string[];

export declare function evaluateToolCall(
  call: ToolCall,
  context?: AuthorizationContext,
): AuthorizationDecision;

export type ParsedPayload =
  | { ok: true; value: unknown }
  | { ok: false; decision: AuthorizationDecision };

export declare function parsePayload(raw: string): ParsedPayload;

export interface RenderedDecision extends AuthorizationDecision {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: PermissionDecision;
    permissionDecisionReason: string;
  };
}

export declare function normalizeToolCall(call: ToolCall): {
  rawName: string;
  kind: string;
  paths: string[];
  command: string;
};

export declare function renderDecision(decision: AuthorizationDecision): RenderedDecision;
export declare function tokenize(name: string): string[];

export declare function classifyTool(rawName: string): "read" | "edit" | "shell" | "unknown";