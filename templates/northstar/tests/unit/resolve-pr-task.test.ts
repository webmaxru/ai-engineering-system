import { describe, expect, it } from "vitest";
import { TASK_AUTHORITY_PATHS } from "../../scripts/workspace-owner.mjs";
import { contractFromFile } from "../../scripts/task-contract.mjs";
import { runScopedUnownedCachePaths } from "../../scripts/resolve-pr-task.mjs";

const repository = "fixture/northstar";
const fixture = contractFromFile("tests/fixtures/WI-1842.issue.md");
const contract = {
  ...fixture,
  source: {
    ...fixture.source,
    trusted: true,
    issue: 16,
    url: `https://github.com/${repository}/issues/16`,
  },
};

describe("isolated workflow cache transition", () => {
  it("permits only exact same-repository workflow-run contexts", () => {
    expect(runScopedUnownedCachePaths(contract, {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: repository,
      GITHUB_RUN_ID: "101",
      GITHUB_RUN_ATTEMPT: "2",
    })).toEqual(TASK_AUTHORITY_PATHS);
  });

  it.each([
    { GITHUB_ACTIONS: "false", GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "2" },
    { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "another/repository", GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "2" },
    { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "" },
  ])("does not authorize an unowned-cache transition for incomplete context", (env) => {
    expect(runScopedUnownedCachePaths(contract, env)).toEqual([]);
  });
});
