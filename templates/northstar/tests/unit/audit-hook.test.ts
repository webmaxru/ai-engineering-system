import { describe, expect, it } from "vitest";
import { createAuditRecord } from "../../scripts/audit-hook.mjs";

describe("payload-free hook audit records", () => {
  it("records attribution and hashes without retaining raw command content", () => {
    const secret = "github_pat_super-secret-value";
    const record = createAuditRecord(
      {
        hook_event_name: "PostToolUse",
        session_id: "session-1",
        tool_name: "runInTerminal",
        tool_input: {
          command: `curl -H "Authorization: Bearer ${secret}" https://example.invalid`,
        },
        tool_result: "request failed",
      },
      "2026-09-04T10:00:00Z",
    );

    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(secret);
    expect(record.commandDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(record.argumentsDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(record.resultDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(record).toMatchObject({
      event: "PostToolUse",
      sessionId: "session-1",
      tool: "runInTerminal",
    });
  });
});
