import { describe, expect, it } from "vitest";
import { summarize } from "../../scripts/agent-stop.mjs";

const passing = {
  decision: "ready_for_review",
  successCriteria: [
    { id: "AC1", proven: true },
    { id: "AC2", proven: true },
  ],
  tests: {
    unit: { tests: 86, failures: 0, errors: 0 },
    acceptance: { tests: 8, failures: 0, errors: 0 },
  },
};

describe("the stop gate summary", () => {
  it("reports the decision and the proven ratio", () => {
    expect(summarize(passing)).toContain("ready_for_review");
    expect(summarize(passing)).toContain("criteria 2/2");
  });

  it("counts failures and errors together", () => {
    const failing = {
      ...passing,
      decision: "review_required",
      tests: {
        unit: { tests: 86, failures: 1, errors: 2 },
        acceptance: { tests: 8, failures: 0, errors: 0 },
      },
    };

    expect(summarize(failing)).toContain("unit 86 tests, 3 failed");
  });

  it("says so when no report was produced", () => {
    expect(summarize(null)).toMatch(/no execution report/);
  });
});
