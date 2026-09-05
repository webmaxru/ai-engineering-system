import { describe, expect, it } from "vitest";
import { validateMaintenanceRuns } from "../../scripts/verify-maintenance-runs.mjs";

const repository = "webmaxru/northstar-orders-api-demo";
const headSha = "a".repeat(40);
const pullRequest = 7;
const manifest = {
  schema: "northstar/system-maintenance-manifest/1",
  repository,
  pullRequest,
  headSha,
  evidenceRunId: 22,
  sourceRunId: 11,
  evidenceWorkflow: ".github/workflows/publish-evidence.yml",
  sourceWorkflow: ".github/workflows/governed-change.yml",
};
const evidenceRun = {
  id: 22,
  event: "workflow_run",
  status: "completed",
  conclusion: "success",
  path: ".github/workflows/publish-evidence.yml",
  repository: { full_name: repository },
};
const sourceRun = {
  id: 11,
  event: "pull_request",
  status: "completed",
  conclusion: "failure",
  head_sha: headSha,
  path: ".github/workflows/governed-change.yml",
  repository: { full_name: repository },
  pull_requests: [{ number: pullRequest }],
};

describe("system-maintenance run provenance", () => {
  it("binds the evidence run to the exact source run, PR, and SHA", () => {
    expect(
      validateMaintenanceRuns({
        manifest,
        evidenceRun,
        sourceRun,
        repository,
        pullRequest,
        headSha,
      }),
    ).toEqual({ ok: true, errors: [] });
  });

  it("rejects wrong workflow, repository, PR, SHA, or reused run ID", () => {
    const result = validateMaintenanceRuns({
      manifest,
      evidenceRun: {
        ...evidenceRun,
        path: ".github/workflows/attacker.yml",
      },
      sourceRun: {
        ...sourceRun,
        id: 22,
        head_sha: "b".repeat(40),
        pull_requests: [{ number: 8 }],
      },
      repository,
      pullRequest,
      headSha,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(
      /trusted Publish Evidence|requested SHA|requested pull request|must differ/,
    );
  });
});
