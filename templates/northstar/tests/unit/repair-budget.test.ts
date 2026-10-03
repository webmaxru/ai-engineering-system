import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classify, decide, failureEvidence, failureSignature, runStopAttempt } from "../../scripts/repair-budget.mjs";

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
  it("does not classify a passing policy-test filename as the cause of a failed assertion", () => {
    expect(classify("PASS tests/unit/risk-policy.test.ts\nAssertionError: expected replay to be true"))
      .toMatchObject({ layer: "reasoning", action: "repair" });
  });

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

  const temporary: string[] = [];
  afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

  function temp() {
    const root = mkdtempSync(join(tmpdir(), "northstar-recovery-"));
    temporary.push(root);
    return root;
  }

  const scope = {
    repository: "fixture/northstar", taskId: "RECOVERY",
    contractDigest: "a".repeat(64), planDigest: "b".repeat(64),
    baseSha: "c".repeat(40), headSha: "d".repeat(40), sessionId: "fixture-session",
  };

  describe("durable actual Stop accounting", () => {
    it("counts several failed checks in one Stop as one attempt", () => {
      const result = runStopAttempt(scope, () => ({
        failures: [
          failureEvidence({ check: "quality", message: "AssertionError: expected a to be b" }),
          failureEvidence({ check: "acceptance", message: "AssertionError: expected x to be y" }),
        ],
        checks: ["quality", "acceptance"],
      }), { root: temp() });
      expect(result.decision).toBe("repair");
      expect(result.remainingAttempts).toBe(2);
      expect(result.attempts).toHaveLength(1);
      expect(result.history).toHaveLength(2);
    });

    it("keeps retry history isolated per session while preserving repeats across HEAD changes", () => {
      const root = temp();
      const evaluate = () => ({ failures: [failureEvidence({ check: "quality", message: CONCURRENCY_FAILURE })] });
      const first = runStopAttempt({ ...scope, sessionId: "first-session" }, evaluate, { root });
      const second = runStopAttempt({
        ...scope, sessionId: "first-session", headSha: "e".repeat(40),
      }, evaluate, { root });
      expect(first.decision).toBe("repair");
      expect(second).toMatchObject({ decision: "escalate", repeats: 2, reason: expect.stringContaining("same quality") });
      expect(second.path).toBe(first.path);
      expect(second.attempts.map(({ sessionId }) => sessionId)).toEqual(["first-session", "first-session"]);
      const isolated = runStopAttempt({
        ...scope, sessionId: "second-session",
      }, evaluate, { root });
      expect(isolated.decision).toBe("repair");
      expect(isolated.path).not.toBe(first.path);
      expect(isolated.attempts).toHaveLength(1);
      let invoked = false;
      const third = runStopAttempt({
        ...scope, sessionId: "first-session",
      }, () => { invoked = true; return { failures: [] }; }, { root });
      expect(invoked).toBe(false);
      expect(third.attempts).toHaveLength(2);
    });

    it("enforces three actual attempts even when the failures change", () => {
      const root = temp();
      for (const [index, word] of ["replay", "conflict", "metrics"].entries()) {
        const result = runStopAttempt(scope, () => ({
          failures: [failureEvidence({ check: "quality", message: `AssertionError: expected ${word} to be true` })],
        }), { root });
        expect(result.attempts).toHaveLength(index + 1);
        expect(result.decision).toBe(index === 2 ? "escalate" : "repair");
        if (index === 2) expect(result.reason).toContain("budget");
      }
    });

    it("allows only one repaired environment retry, even when diagnostics change", () => {
      const root = temp();
      runStopAttempt(scope, () => ({ failures: [failureEvidence({ check: "acceptance", message: "ECONNREFUSED" })] }), { root });
      const retry = runStopAttempt(scope, () => ({ failures: [failureEvidence({ check: "acceptance", message: "ETIMEDOUT" })] }), { root });
      expect(retry).toMatchObject({ decision: "escalate", reason: expect.stringContaining("environment retry") });
    });

    it.each(["permission denied", "CodeQL vulnerability", "opaque diagnostic"])("keeps escalation latched for %s", (message) => {
      const root = temp();
      const first = runStopAttempt(scope, () => ({ failures: [failureEvidence({ check: "quality", message })] }), { root });
      let invoked = false;
      const second = runStopAttempt(scope, () => { invoked = true; return { failures: [] }; }, { root });
      expect(first.decision).toBe("escalate");
      expect(second.decision).toBe("escalate");
      expect(invoked).toBe(false);
    });

    it("persists only normalized signatures and classifications, not raw command output", () => {
      const result = runStopAttempt(scope, () => ({
        failures: [failureEvidence({ check: "quality", message: "AssertionError: expected private-diagnostic-marker to be absent" })],
      }), { root: temp() });
      const saved = readFileSync(result.path, "utf8");
      expect(saved).not.toContain("private-diagnostic-marker");
      expect(saved).toContain(result.history[0]!.signature);
    });

    it("rejects corrupt and interrupted history rather than resetting the budget", () => {
      const root = temp();
      const first = runStopAttempt(scope, () => ({ failures: [failureEvidence({ check: "quality", message: CONCURRENCY_FAILURE })] }), { root });
      const original = readFileSync(first.path, "utf8");
      writeFileSync(first.path, "{");
      expect(() => runStopAttempt(scope, () => ({ failures: [] }), { root })).toThrow(/Malformed/);
      const interrupted = JSON.parse(original) as { attempts: Array<{ status: string; completedAt: string | null }> };
      interrupted.attempts[0]!.status = "running";
      interrupted.attempts[0]!.completedAt = null;
      writeFileSync(first.path, JSON.stringify(interrupted));
      expect(runStopAttempt(scope, () => ({ failures: [] }), { root })).toMatchObject({
        decision: "escalate", reason: expect.stringContaining("interrupted"),
      });
    });

    it("serializes competing Stop invocations without spending two attempts", () => {
      const root = temp();
      const result = runStopAttempt(scope, () => {
        expect(() => runStopAttempt(scope, () => ({ failures: [] }), { root })).toThrow(/lock unavailable/);
        return { failures: [failureEvidence({ check: "quality", message: CONCURRENCY_FAILURE })] };
      }, { root });
      expect(result.attempts).toHaveLength(1);
    });

    it("retains a policy escalation even when a later legacy failure looks repairable", () => {
      expect(decide([
        { check: "policy", message: "permission denied" },
        { check: "quality", message: CONCURRENCY_FAILURE },
      ]).decision).toBe("escalate");
    });
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
