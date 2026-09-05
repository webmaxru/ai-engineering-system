import { describe, expect, it } from "vitest";
import { classify, decide, failureSignature } from "../../scripts/repair-budget.mjs";

const CONCURRENCY_FAILURE =
  "AssertionError: expected 2 to be 1 // creates exactly one order under concurrent cross-instance retries";

describe("failure signatures", () => {
  it("treats the same failure as the same failure across runs", () => {
    const first = failureSignature({
      check: "acceptance",
      message: `${CONCURRENCY_FAILURE} at /home/runner/work/repo/tests/x.ts in 812ms (run 4a91c02)`,
    });
    const second = failureSignature({
      check: "acceptance",
      message: `${CONCURRENCY_FAILURE} at /tmp/build-99/tests/x.ts in 1204ms (run 7fd31ab)`,
    });

    expect(first).toBe(second);
  });

  it("separates different failures", () => {
    expect(failureSignature({ check: "acceptance", message: CONCURRENCY_FAILURE })).not.toBe(
      failureSignature({ check: "acceptance", message: "AssertionError: expected conflict, received replay" }),
    );
  });

  it("collapses failures that differ only by a numeric value", () => {
    expect(failureSignature({ check: "unit", message: "expected 2 to be 1" })).toBe(
      failureSignature({ check: "unit", message: "expected 7 to be 1" }),
    );
  });
});

describe("classification decides which layer changes", () => {
  it("sends permission failures to a human instead of a new prompt", () => {
    expect(classify("EACCES: permission denied writing .github/workflows/ci.yml")).toMatchObject({
      layer: "policy",
      action: "escalate",
    });
  });

  it("routes a missing dependency to the bootstrap", () => {
    expect(classify("connect ECONNREFUSED 127.0.0.1:5432")).toMatchObject({
      layer: "environment",
      change: expect.stringContaining("bootstrap"),
    });
  });

  it("treats security failures as blockers rather than retry candidates", () => {
    expect(classify("CodeQL found a reachable vulnerability GHSA-example")).toMatchObject({
      layer: "security",
      action: "escalate",
    });
  });

  it("routes command misuse to the tool layer", () => {
    expect(classify("unknown option --unsafe for tool runner")).toMatchObject({
      layer: "tool",
      action: "repair",
    });
  });

  it("routes merge failures to conflict resolution", () => {
    expect(classify("merge conflict in src/app.ts")).toMatchObject({
      layer: "conflict",
      action: "repair",
    });
  });

  it("routes a missing source of truth to context retrieval", () => {
    expect(classify("Cannot find module '../telemetry/idempotency-metrics.js'")).toMatchObject({
      layer: "context",
    });
  });

  it("routes an assertion failure to the plan, not the assertion", () => {
    expect(classify(CONCURRENCY_FAILURE)).toMatchObject({
      layer: "reasoning",
      change: expect.stringContaining("not the assertion"),
    });
  });
});

describe("repair budget", () => {
  it("allows a first bounded repair", () => {
    const result = decide([{ check: "acceptance", message: CONCURRENCY_FAILURE }]);

    expect(result.decision).toBe("repair");
    expect(result.remainingAttempts).toBe(2);
  });

  it("escalates when the same check fails twice with the same signature", () => {
    const result = decide([
      { check: "acceptance", message: `${CONCURRENCY_FAILURE} in 812ms` },
      { check: "acceptance", message: `${CONCURRENCY_FAILURE} in 1190ms` },
    ]);

    expect(result.decision).toBe("escalate");
    expect(result.repeats).toBe(2);
    expect(result.reason).toMatch(/another attempt is not recovery/);
  });

  it("still allows a repair when the second failure is genuinely different", () => {
    const result = decide([
      { check: "acceptance", message: CONCURRENCY_FAILURE },
      { check: "acceptance", message: "AssertionError: expected conflict, received replay" },
    ]);

    expect(result.decision).toBe("repair");
  });

  it("escalates a permission failure immediately", () => {
    const result = decide([
      { check: "ci", message: "EACCES: permission denied writing .github/workflows/ci.yml" },
    ]);

    expect(result.decision).toBe("escalate");
    expect(result.reason).toMatch(/adjust authority/);
  });

  it("exhausts the attempt budget even when every failure differs", () => {
    const result = decide([
      { check: "unit", message: "AssertionError: expected replayed to be true" },
      { check: "unit", message: "AssertionError: expected status code to equal conflict" },
      { check: "unit", message: "AssertionError: expected metrics counter to have been incremented" },
    ]);

    expect(result.decision).toBe("escalate");
    expect(result.repeats).toBe(1);
    expect(result.reason).toMatch(/budget/);
  });
});
