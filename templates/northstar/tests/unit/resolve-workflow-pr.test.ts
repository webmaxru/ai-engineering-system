import { describe, expect, it } from "vitest";
import { selectWorkflowPullRequest } from "../../scripts/resolve-workflow-pr.mjs";

const repository = "webmaxru/northstar-orders-api-demo";
const sha = "a".repeat(40);

function pull(overrides: Record<string, unknown> = {}) {
  return {
    number: 7,
    state: "open",
    head: { sha, repo: { full_name: repository } },
    base: { ref: "main", repo: { full_name: repository } },
    ...overrides,
  };
}

describe("workflow-run pull request identity", () => {
  it("selects exactly the same-repository PR for the immutable head SHA", () => {
    expect(
      selectWorkflowPullRequest({
        pulls: [pull()],
        sha,
        repository,
        defaultBranch: "main",
      }),
    ).toMatchObject({ number: 7 });
  });

  it("rejects a fork, another SHA, another base, or an ambiguous match", () => {
    for (const candidate of [
      pull({ head: { sha, repo: { full_name: "attacker/fork" } } }),
      pull({ head: { sha: "b".repeat(40), repo: { full_name: repository } } }),
      pull({ base: { ref: "release", repo: { full_name: repository } } }),
    ]) {
      expect(() =>
        selectWorkflowPullRequest({
          pulls: [candidate],
          sha,
          repository,
          defaultBranch: "main",
        }),
      ).toThrow(/exactly one/);
    }
    expect(() =>
      selectWorkflowPullRequest({
        pulls: [pull(), pull({ number: 8 })],
        sha,
        repository,
        defaultBranch: "main",
      }),
    ).toThrow(/found 2/);
  });
});
