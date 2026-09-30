import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditRecord, writeAuditRecord } from "../../scripts/audit-hook.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import {
  bindWorkspaceOwner,
  claimWorkspaceOwner,
  releaseWorkspaceClaim,
} from "../../scripts/workspace-owner.mjs";

describe("payload-free hook audit records", () => {
  it("records failure events as failures even when error fields are absent", () => {
    expect(createAuditRecord({ hook_event_name: "PostToolUseFailure" }).success).toBe(false);
    expect(createAuditRecord({ hookEventName: "postToolUseFailure", success: true }).success).toBe(false);
    expect(createAuditRecord({ hookEventName: "PostToolUse", toolResult: { resultType: "failure" } }).success).toBe(false);
    expect(createAuditRecord({ hook_event_name: "SessionEnd" }).success).toBeNull();
  });
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
      taskId: null,
      workspaceOwnerVerified: false,
    });
  });

  it("keeps local audit output in a session-specific artifact file", () => {
    const root = mkdtempSync(join(tmpdir(), "northstar-audit-owner-"));
    try {
      const first = createAuditRecord({ hook_event_name: "PostToolUse", session_id: "session-one" });
      const second = createAuditRecord({ hook_event_name: "PostToolUse", session_id: "session-two" });
      const firstPath = writeAuditRecord(first, null, root);
      const secondPath = writeAuditRecord(second, null, root);

      expect(firstPath).not.toBe(secondPath);
      expect(existsSync(firstPath)).toBe(true);
      expect(existsSync(secondPath)).toBe(true);
      expect(readFileSync(firstPath, "utf8")).toContain('"sessionId":"session-one"');
      expect(readFileSync(secondPath, "utf8")).toContain('"sessionId":"session-two"');
      expect(() => writeAuditRecord(createAuditRecord({ hook_event_name: "SessionEnd" }), null, root))
        .toThrow(/explicit session identity/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("attributes task and plan only to the exact owning session", () => {
    const root = mkdtempSync(join(tmpdir(), "northstar-audit-owner-"));
    const repository = "fixture/northstar";
    const sessionId = "owner-session";
    try {
      const fixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
      const contract = {
        ...fixture,
        source: {
          ...fixture.source,
          trusted: true,
          issue: 41,
          actor: "fixture-owner",
          association: "OWNER",
          kind: "issue #41",
          url: `https://github.com/${repository}/issues/41`,
        },
      };
      const owner = claimWorkspaceOwner({
        root,
        issue: 41,
        taskId: contract.id,
        contractDigest: contract.source.bodyDigest,
        sessionId,
        env: { GITHUB_REPOSITORY: repository },
        contract,
      });
      bindWorkspaceOwner(owner, contract);
      mkdirSync(join(root, "artifacts"), { recursive: true });
      writeFileSync(join(root, "artifacts", "task-session.json"), JSON.stringify({
        issue: 41,
        taskId: contract.id,
        contractDigest: contract.source.bodyDigest,
        sessionId,
        workspaceOwner: owner.identity.ownerKey,
      }));
      writeFileSync(join(root, "artifacts", "task-contract.json"), JSON.stringify(contract));
      writeFileSync(join(root, "artifacts", "plan.json"), JSON.stringify({
        taskId: contract.id,
        contractDigest: contract.source.bodyDigest,
        planDigest: "a".repeat(64),
      }));
      releaseWorkspaceClaim(owner);

      const active = createAuditRecord(
        { hook_event_name: "PostToolUse", session_id: sessionId },
        undefined,
        root,
        { GITHUB_REPOSITORY: repository },
      );
      const foreign = createAuditRecord(
        { hook_event_name: "PostToolUse", session_id: "another-session" },
        undefined,
        root,
        { GITHUB_REPOSITORY: repository },
      );

      expect(active).toMatchObject({
        taskId: contract.id,
        contractDigest: contract.source.bodyDigest,
        planDigest: "a".repeat(64),
        workspaceOwnerVerified: true,
      });
      expect(foreign).toMatchObject({
        taskId: null,
        contractDigest: null,
        planDigest: null,
        workspaceOwnerVerified: false,
      });
      expect(() => writeAuditRecord(active, "../outside.jsonl", root)).toThrow(/inside the repository/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
