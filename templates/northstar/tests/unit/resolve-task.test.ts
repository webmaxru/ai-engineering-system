import { describe, expect, it } from "vitest";

import {
  decide,
  extractIssue,
  isTaskInvocation,
} from "../../scripts/resolve-task.mjs";

describe("the issue number is an argument, not a guess", () => {
  it("recognizes the raw slash invocation", () => {
    expect(isTaskInvocation("/plan 4")).toBe(true);
    expect(isTaskInvocation("/implement 4")).toBe(true);
  });

  it("recognizes the expanded prompt body", () => {
    // It is not documented whether UserPromptSubmit receives the typed text or
    // the expanded prompt file. Both forms are matched so the hook behaves the
    // same either way rather than silently doing nothing in one of them.
    expect(
      isTaskInvocation("Task issue: #4\n\nThat number is the only thing..."),
    ).toBe(true);
  });

  it("ignores an ordinary chat turn", () => {
    // A workspace hook fires on every prompt. Anything else here would put a
    // GitHub round trip in front of every unrelated question.
    expect(isTaskInvocation("why does the retry policy back off?")).toBe(false);
    expect(decide("why does the retry policy back off?")).toEqual({
      action: "ignore",
    });
  });

  it("reads the number from every form a human might type", () => {
    expect(extractIssue("/plan 4")).toBe(4);
    expect(extractIssue("/implement #12")).toBe(12);
    expect(extractIssue("Task issue: #7")).toBe(7);
    expect(extractIssue("please plan issue #31 today")).toBe(31);
    expect(extractIssue("npm run contract:fetch -- --issue 9")).toBe(9);
  });

  it("stops the turn when a task agent is invoked with no number", () => {
    const decision = decide("/plan");
    expect(decision).toMatchObject({ action: "stop" });
    expect(decision.action === "stop" && decision.reason).toMatch(
      /issue as an argument/,
    );
  });

  it("stops rather than resolving an unsubstituted placeholder", () => {
    // If the input variable is not filled in, the body still looks like an
    // invocation. Guessing which issue was meant is the failure mode this whole
    // change removes.
    expect(decide("Task issue: #${input:issue}").action).toBe("stop");
  });

  it("resolves when the number is given", () => {
    expect(decide("/implement 4")).toEqual({ action: "resolve", issue: 4 });
  });
});
