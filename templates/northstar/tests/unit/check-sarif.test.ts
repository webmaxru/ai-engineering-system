import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSarif, validateSarif } from "../../scripts/check-sarif.mjs";
import { scanTrackedFiles } from "../../scripts/secret-scan.mjs";

const temporary: string[] = [];
function temp() {
  const root = mkdtempSync(join(tmpdir(), "northstar-sarif-"));
  temporary.push(root);
  return root;
}
function log(results: unknown[] = []) {
  return {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "CodeQL", rules: [{ id: "sample/rule" }] } },
      invocations: [{ executionSuccessful: true }],
      results,
    }],
  };
}
afterEach(() => temporary.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("fail-closed security evidence", () => {
  it("rejects malformed or unreadable security evidence", () => {
    const root = temp();
    const path = join(root, "results.sarif");
    writeFileSync(path, JSON.stringify(log()));
    expect(checkSarif(root).ok).toBe(true);
    for (const malformed of [{}, null, [], { version: "2.1.0" }, { version: "2.1.0", runs: [] }]) {
      writeFileSync(path, JSON.stringify(malformed));
      expect(checkSarif(root)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.any(String)]) });
    }
    writeFileSync(path, "{");
    expect(checkSarif(root).ok).toBe(false);
    writeFileSync(path, JSON.stringify(log()));
    expect(checkSarif(root, { read: () => { throw Object.assign(new Error("not readable"), { code: "EACCES" }); } }))
      .toMatchObject({ ok: false, errors: [expect.stringContaining("EACCES")] });
    rmSync(path);
    expect(checkSarif(root).ok).toBe(false);
    expect(() => scanTrackedFiles(["missing-source.ts"], { root })).toThrow(/Secret scan incomplete/);
  });

  it.each([
    { version: "1.0.0", runs: [] },
    { version: "2.1.0", runs: [null] },
    { version: "2.1.0", runs: [{ tool: { driver: {} }, results: [] }] },
    { version: "2.1.0", runs: [{ tool: { driver: { name: "CodeQL" } } }] },
    { version: "2.1.0", runs: [{ tool: { driver: { name: "CodeQL" } }, results: {} }] },
    { version: "2.1.0", runs: [{ tool: { driver: { name: "CodeQL", version: 5 } }, results: [] }] },
    log([null]),
    log([{}]),
    log([{ ruleId: "sample/rule", message: {} }]),
    log([{ ruleId: "sample/rule", message: { text: "finding" }, level: "success" }]),
    log([{ ruleIndex: 10, message: { text: "finding" } }]),
    log([{ ruleId: "different", ruleIndex: 0, message: { text: "finding" } }]),
    log([{ ruleId: "sample/rule", message: { text: "finding" }, suppressions: [{}] }]),
  ])("rejects invalid SARIF structure %#", (data) => {
    expect(validateSarif(data).ok).toBe(false);
    expect(validateSarif(data).errors.length).toBeGreaterThan(0);
  });

  it("rejects failed scanner invocations and diagnostic errors even without findings", () => {
    const failure = log();
    failure.runs[0]!.invocations[0]!.executionSuccessful = false;
    expect(validateSarif(failure).errors).toContain("<memory>: run 1: scanner execution was unsuccessful or unverified.");
    const diagnostics = { ...log(), runs: [{
      ...log().runs[0],
      invocations: [{
        executionSuccessful: true,
        toolExecutionNotifications: [{ level: "error", message: { text: "analysis incomplete" } }],
      }],
    }] };
    expect(validateSarif(diagnostics).ok).toBe(false);
  });

  it("accepts CodeQL informational notifications with an empty valid text message", () => {
    const diagnostics = {
      ...log(),
      runs: [{
        ...log().runs[0],
        invocations: [{
          executionSuccessful: true,
          toolExecutionNotifications: [{
            level: "none", message: { text: "" },
            descriptor: { id: "fixture/extraction-coverage" },
          }],
        }],
      }],
    };
    expect(validateSarif(diagnostics)).toMatchObject({ ok: true, errors: [], findings: [] });
    diagnostics.runs[0]!.invocations[0]!.toolExecutionNotifications[0]!.level = "error";
    expect(validateSarif(diagnostics).ok).toBe(false);
  });

  it("rejects absent and wrong-typed diagnostic messages", () => {
    for (const message of [{}, { text: 12 }, { id: "" }, { text: "", markdown: false }]) {
      expect(validateSarif({
        ...log(),
        runs: [{
          ...log().runs[0],
          invocations: [{ executionSuccessful: true, toolExecutionNotifications: [{ level: "none", message }] }],
        }],
      }).ok).toBe(false);
    }
  });

  it("does not treat suppression metadata as permission to discard a finding", () => {
    const result = validateSarif(log([{
      ruleIndex: 0, message: { text: "sensitive details must not be logged" },
      suppressions: [{ kind: "inSource", status: "accepted" }],
    }]));
    expect(result).toMatchObject({
      ok: false, findings: [{ ruleId: "sample/rule", suppressed: true }],
    });
    expect(JSON.stringify(result)).not.toContain("sensitive details");
  });

  it("preserves emitted rule, severity, URI, and line without exposing messages or snippets", () => {
    const result = validateSarif(log([{
      ruleId: "sample/rule", level: "error", message: { text: "private message marker" },
      locations: [
        { physicalLocation: {
          artifactLocation: { uri: ".github/workflows/publish-evidence.yml" },
          region: { startLine: 42, snippet: { text: "private source marker" } },
        } },
        { physicalLocation: { artifactLocation: { uri: ".github/workflows/production-gate.yml" } } },
      ],
    }]), "artifacts/scan.sarif");
    expect(result.findings).toEqual([{
      file: "artifacts/scan.sarif", ruleId: "sample/rule", level: "error", suppressed: false,
      uri: ".github/workflows/publish-evidence.yml", line: 42,
      locations: [
        { uri: ".github/workflows/publish-evidence.yml", line: 42 },
        { uri: ".github/workflows/production-gate.yml", line: null },
      ],
    }]);
    expect(JSON.stringify(result)).not.toMatch(/private (message|source) marker/);
  });

  it("reports absent locations explicitly rather than inventing a file or line", () => {
    const result = validateSarif(log([{ ruleId: "sample/rule", message: { text: "finding" } }]));
    expect(result.findings[0]).toMatchObject({ uri: null, line: null, locations: [] });
  });

  it("retains readable findings while reporting other unreadable SARIF files", () => {
    const root = temp();
    writeFileSync(join(root, "one.sarif"), JSON.stringify(log([{ ruleId: "sample/rule", message: { text: "finding" } }])));
    writeFileSync(join(root, "two.sarif"), JSON.stringify(log()));
    const result = checkSarif(root, {
      read: (file) => {
        if (file.endsWith("two.sarif")) throw Object.assign(new Error("denied"), { code: "EACCES" });
        return readFileSync(file, "utf8");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });

  it("returns a nonzero CLI status for malformed evidence rather than claiming zero findings", () => {
    const root = temp();
    writeFileSync(join(root, "malformed.sarif"), "{}");
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "..", "..", "scripts", "check-sarif.mjs"), root], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("SARIF gate failed");
    expect(result.stdout).not.toContain("gate passed");
  });
});
