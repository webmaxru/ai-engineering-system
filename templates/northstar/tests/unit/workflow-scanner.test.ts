import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SpawnSyncReturns } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { scanWorkflows, ZIZMOR_IMAGE } from "../../scripts/check-sarif.mjs";
import type { WorkflowScannerSpawn } from "../../scripts/check-sarif.mjs";

const temporary: string[] = [];
function temp() {
  const root = mkdtempSync(join(tmpdir(), "northstar-workflow-scan-"));
  temporary.push(root);
  return root;
}
function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function output(results: unknown[] = [], version = "1.30.0") {
  return JSON.stringify({
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "zizmor", version, semanticVersion: version } },
      invocations: [{ executionSuccessful: true }], results,
    }],
  });
}
function processResult(changes: Partial<SpawnSyncReturns<string>> = {}): SpawnSyncReturns<string> {
  return { pid: 1, status: 0, signal: null, output: [null, "", ""], stdout: output(), stderr: "", ...changes };
}
function fixture() {
  const root = temp();
  write(root, ".github/workflows/handwritten.yml", "on: push\njobs: {}\n");
  write(root, ".github/workflows/handwritten.yaml", "on: push\njobs: {}\n");
  write(root, ".github/workflows/generated.lock.yml", "on: schedule\njobs: {}\n");
  write(root, ".github/workflows/source.md", "Agentic Workflow source, not YAML");
  return root;
}
afterEach(() => temporary.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("pinned workflow scanner", { timeout: 20000 }, () => {
  it("propagates pinned zizmor scanner failures", () => {
    const root = fixture();
    expect(scanWorkflows({ root, spawn: () => processResult() }).ok).toBe(true);
    const failures = [
      processResult({ status: 2, stderr: "error: unknown argument" }),
      processResult({ status: 1, stderr: "ERROR incomplete scan" }),
      processResult({ status: null, error: Object.assign(new Error("not found"), { code: "ENOENT" }) }),
      processResult({ status: null, signal: "SIGTERM" }),
      processResult({ stderr: "ERROR input was not scanned" }),
      processResult({ stderr: "2026-09-23T10:00:00Z ERROR input was not scanned" }),
      processResult({ stderr: "WARN failed to parse workflow input" }),
      processResult({ stdout: "{}" }),
      processResult({ stdout: "" }),
      processResult({ stdout: output([], "1.29.0") }),
      processResult({ stdout: output([{ ruleId: "zizmor/template-injection", message: { text: "finding" } }]) }),
    ];
    for (const result of failures) {
      const report = scanWorkflows({ root, spawn: () => result });
      expect(report.ok).toBe(false);
      expect(report.exitCode).not.toBe(0);
      expect(report.errors.length + report.findings.length).toBeGreaterThan(0);
    }
  });

  it("pins the reviewed image and passes every handwritten and generated YAML as a separate argument", () => {
    const root = fixture();
    const calls: Array<{ command: string; args: string[]; shell: boolean | string | undefined }> = [];
    const spawn: WorkflowScannerSpawn = (command, args, options) => {
      calls.push({ command, args, shell: options.shell });
      return processResult({ stderr: " INFO completed workflow analysis" });
    };
    const result = scanWorkflows({ root, spawn });
    expect(result.ok).toBe(true);
    expect(result.files).toEqual([
      ".github/workflows/generated.lock.yml",
      ".github/workflows/handwritten.yaml",
      ".github/workflows/handwritten.yml",
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      command: "docker", shell: false,
      args: expect.arrayContaining([ZIZMOR_IMAGE, "--strict-collection", "--offline", "--no-config", ...result.files]),
    });
    expect(ZIZMOR_IMAGE).toBe("ghcr.io/zizmorcore/zizmor@sha256:1ba0035c343f50e85fde29beb0d78e4db448eaa0c762a11a09805d241424ee03");
    expect(result.version).toBe("1.30.0");
    expect(calls[0]!.args).toContain("--pull=never");
    expect(calls[0]!.args).not.toContain("--no-exit-codes");
    expect(calls[0]!.args).not.toContain("--fix");
    expect(calls[0]!.args).toContain(`${root}:/workdir:ro`);
  });

  it("retains exact raw SARIF and emits only actionable location metadata", () => {
    const root = fixture();
    const raw = `${output([{
      ruleId: "zizmor/template-injection", level: "error", message: { text: "private diagnostic marker" },
      locations: [{ physicalLocation: {
        artifactLocation: { uri: ".github/workflows/handwritten.yml" },
        region: { startLine: 7, snippet: { text: "private source marker" } },
      } }],
    }])}\n`;
    const result = scanWorkflows({ root, spawn: () => processResult({ stdout: raw }) });
    expect(result).toMatchObject({
      ok: false, artifact: "artifacts/zizmor.sarif",
      artifactDigest: createHash("sha256").update(raw).digest("hex"),
      scannerExitCode: 0, exitCode: 1,
      findings: [{ uri: ".github/workflows/handwritten.yml", line: 7, ruleId: "zizmor/template-injection", level: "error" }],
    });
    expect(readFileSync(join(root, "artifacts", "zizmor.sarif"), "utf8")).toBe(raw);
    expect(JSON.stringify(result)).not.toMatch(/private (diagnostic|source) marker/);
  });

  it("retains malformed current output for diagnosis but never reuses an older artifact", () => {
    const root = fixture();
    const invalid = scanWorkflows({ root, spawn: () => processResult({ stdout: "{}" }) });
    expect(invalid.ok).toBe(false);
    expect(invalid.artifact).toBe("artifacts/zizmor.sarif");
    expect(readFileSync(join(root, "artifacts", "zizmor.sarif"), "utf8")).toBe("{}");
    const missing = scanWorkflows({
      root, spawn: () => processResult({ stdout: "", status: null, error: Object.assign(new Error("not found"), { code: "ENOENT" }) }),
    });
    expect(missing).toMatchObject({ ok: false, artifact: null, artifactDigest: null });
    expect(existsSync(join(root, "artifacts", "zizmor.sarif"))).toBe(false);
  });

  it("fails rather than claiming a scan whose raw artifact cannot be retained", () => {
    const root = fixture();
    const result = scanWorkflows({
      root,
      spawn: () => {
        mkdirSync(join(root, "artifacts", "zizmor.sarif"));
        return processResult();
      },
    });
    expect(result).toMatchObject({ ok: false, artifact: null, artifactDigest: null, exitCode: 1 });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects missing, empty, or unreadable inputs before starting a scanner", () => {
    const root = fixture();
    let spawned = false;
    const spawn: WorkflowScannerSpawn = () => { spawned = true; return processResult(); };
    expect(scanWorkflows({
      root, spawn, read: () => { throw Object.assign(new Error("read denied"), { code: "EACCES" }); },
    }).ok).toBe(false);
    expect(spawned).toBe(false);
    write(root, ".github/workflows/handwritten.yml", "");
    expect(scanWorkflows({ root, spawn }).ok).toBe(false);
    expect(spawned).toBe(false);
    expect(scanWorkflows({ root: temp(), spawn }).ok).toBe(false);
    expect(spawned).toBe(false);
  });

  it("rejects source or configuration changes while scanning", () => {
    const root = fixture();
    const result = scanWorkflows({
      root,
      spawn: () => {
        write(root, ".github/workflows/new.yaml", "on: push\njobs: {}\n");
        return processResult();
      },
    });
    expect(result.errors).toContain("Workflow inputs or configuration changed during the scan.");
    expect(result.ok).toBe(false);
  });

  it("does not treat a config read failure as an absent optional config", () => {
    const root = fixture();
    write(root, ".github/zizmor.yml", "rules: {}\n");
    let spawned = false;
    const result = scanWorkflows({
      root,
      read: (file) => {
        if (file.endsWith("zizmor.yml")) throw Object.assign(new Error("disappeared after discovery"), { code: "ENOENT" });
        return readFileSync(file, "utf8");
      },
      spawn: () => { spawned = true; return processResult(); },
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Workflow scan failed before validation completed: ENOENT");
    expect(spawned).toBe(false);
  });

  it("requires zizmor's successful invocation evidence as well as its version", () => {
    const root = fixture();
    const result = scanWorkflows({
      root, spawn: () => processResult({
        stdout: JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: { name: "zizmor", version: "1.30.0" } }, results: [] }] }),
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Workflow scanner did not attest successful execution in its SARIF output.");
  });

  it("retains and reports existing suppression configuration without inventing zero suppressed findings", () => {
    const root = fixture();
    write(root, ".github/zizmor.yml", "rules:\n  artipacked:\n    ignore:\n      - handwritten.yml\n");
    write(root, ".github/workflows/handwritten.yml", "on: push\n# zizmor: ignore[github-env] - reviewed exception\njobs: {}\n");
    let args: string[] = [];
    const result = scanWorkflows({ root, spawn: (_command, arguments_) => { args = arguments_; return processResult(); } });
    expect(result.ok).toBe(true);
    expect(result.configuration).toBe(".github/zizmor.yml");
    expect(result.suppressionDirectives).toEqual([{ file: ".github/workflows/handwritten.yml", line: 2, rules: ["github-env"] }]);
    expect(args).toContain("--config");
    expect(args).not.toContain("--no-config");
    expect(result.limits).toContain("Suppression directives are inventoried, not counted as verified suppressed findings; existing exceptions are not changed.");
    expect(readFileSync(join(root, ".github/zizmor.yml"), "utf8")).toContain("ignore:");
  });

  it("returns launch exceptions as explicit failure and preserves nonzero exit codes", () => {
    const root = fixture();
    expect(scanWorkflows({ root, spawn: () => { throw new Error("launch failed"); } }))
      .toMatchObject({ ok: false, exitCode: 1, errors: [expect.stringContaining("launch failed")] });
    expect(scanWorkflows({ root, spawn: () => processResult({ status: 14 }) }).exitCode).toBe(14);
  });
});
