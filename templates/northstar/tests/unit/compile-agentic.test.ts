import { describe, expect, it } from "vitest";
import { compilationResult } from "../../scripts/compile-agentic.mjs";

describe("agentic compiler status", () => {
  it("propagates workflow scanner failures", () => {
    for (const stderr of [
      "Error: poutine scanner failed",
      "Poutine: 5 errors",
      "Poutine errors: 5",
      "\u001b[31m✗ Error: scanner launch failed\u001b[0m",
      'level=error msg="poutine could not start"',
      ".github/workflows/publish-evidence.yml:67:1: error: [error] untrusted_checkout_exec",
    ]) {
      expect(compilationResult({ status: 0, stdout: "Running poutine", stderr }).ok).toBe(false);
    }
    expect(compilationResult({ status: 1, stdout: "Poutine complete" }).ok).toBe(false);
    expect(compilationResult({ status: null, error: new Error("ETIMEDOUT") }).ok).toBe(false);
    expect(compilationResult({ status: 0, stdout: "Compilation succeeded" }).ok).toBe(true);
    expect(compilationResult({ status: 0, stdout: "Poutine complete: 0 errors" }).ok).toBe(true);
  });
});
