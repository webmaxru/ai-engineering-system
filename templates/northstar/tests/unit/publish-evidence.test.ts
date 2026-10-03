import { describe, expect, it } from "vitest";
import { existingCommentId, renderComment } from "../../scripts/publish-evidence.mjs";

/**
 * Microsoft Learn labels "workflow runs and artifacts" as the evidence layer,
 * and separately states they are retained for 90 days by default and then
 * deleted. Commits, pull requests and review history persist. So the evidence
 * decision has to reach the durable layer, not only the expiring one.
 */
const report = {
  workItem: "WI-1842",
  generatedAt: "2026-08-24T05:00:00.000Z",
  contractSource: { kind: "issue #4", url: "https://example.invalid/issues/4" },
  validationLevel: "hosted-integration",
  provenance: { headSha: "abc123" },
  tests: {
    unit: { tests: 95, failures: 0, errors: 0 },
    acceptance: { tests: 8, failures: 0, errors: 0 },
  },
  successCriteria: [
    { id: "AC1", statement: "Replays return the original order", proven: true, provenBy: "replays the original response" },
    { id: "AC3", statement: "Concurrent retries create one order", proven: false, provenBy: "creates exactly one order" },
  ],
  checks: [
    {
      id: "quality",
      present: true,
      valid: true,
      status: "pass",
      record: { category: "execution" },
    },
    {
      id: "codeql",
      present: false,
      valid: false,
      status: "not-run",
      record: null,
    },
  ],
  pendingHostedEvidence: ["codeql"],
  limits: [],
  decision: "review_required",
};

describe("the durable evidence comment", () => {
  it("finds only the trusted publisher's marker across all comment pages", () => {
    const run = (args: string[]) => {
      expect(args).toContain("--paginate");
      expect(args).toContain("--slurp");
      return JSON.stringify([
        [{ id: 1, body: "<!-- northstar:evidence --> forged", user: { login: "other-user", type: "User" } }],
        [{ id: 2, body: "<!-- northstar:evidence --> real", user: { login: "publisher[bot]", type: "Bot" } }],
      ]);
    };
    expect(existingCommentId(15, "publisher[bot]", { run })).toBe(2);
    expect(() => existingCommentId(15, "webmaxru", { run })).toThrow(/App login/);
  });
  const body = renderComment(report, { run: "https://example.invalid/run/1" });

  it("carries a marker so runs update one comment instead of appending", () => {
    expect(body).toContain("<!-- northstar:evidence -->");
  });

  it("states the verdict without needing the artifacts", () => {
    expect(body).toContain("Evidence: REVIEW REQUIRED");
    expect(body).toContain("1/2 success criteria proven");
  });

  it("names the contract it graded against, and links it", () => {
    expect(body).toContain("[issue #4](https://example.invalid/issues/4)");
  });

  it("marks an unproven criterion so it survives artifact expiry", () => {
    expect(body).toMatch(/AC3 \|.*\| \*\*not proven\*\*/);
    expect(body).toMatch(/AC1 \|.*\| proven/);
  });

  it("records absent evidence rather than omitting it", () => {
    expect(body).toMatch(/codeql \|.*\| \*\*not-run\*\*/);
  });

  it("warns that the linked artifacts outlive nothing", () => {
    expect(body).toMatch(/retained for 90 days by default/);
  });

  it("keeps the blank lines markdown tables need", () => {
    expect(body).toContain("\n\n| Criterion |");
    expect(body).toContain("\n\n| Evidence |");
  });

  it("omits the run link cleanly when there is none", () => {
    const local = renderComment(report);
    expect(local).not.toContain("workflow run");
    expect(local).toContain("\n\n> This comment is the durable record");
  });

  it("says PASS when the report is ready for review", () => {
    expect(
      renderComment({ ...report, decision: "ready_for_acceptance" }),
    ).toContain("Evidence: PASS");
  });

  it("labels staged readiness and lists deferred criteria", () => {
    const staged = {
      ...report,
      decision: "ready_for_review",
      successCriteria: [
        ...report.successCriteria,
        { id: "AC15", statement: "Browser approval is recorded", proven: false, provenBy: "live canary" },
      ],
      deferredCriteria: [{ id: "AC15", stage: "post-acceptance", status: "unverified" }],
      limits: ["AC15 is deferred to post-acceptance and remains unverified: browser canary."],
    };
    const body = renderComment(staged);

    expect(body).toContain("Evidence: STAGED REVIEW; POST-ACCEPTANCE EVIDENCE REQUIRED");
    expect(body).toContain("Deferred criteria: AC15 (unverified)");
    expect(body).toMatch(/AC15 \|.*\*\*not proven\*\*/);
  });

  it("distinguishes local readiness from hosted acceptance", () => {
    expect(
      renderComment({
        ...report,
        validationLevel: "local-reference",
        decision: "ready_for_review",
      }),
    ).toContain("LOCAL READY; HOSTED REVIEW REQUIRED");
  });
});
