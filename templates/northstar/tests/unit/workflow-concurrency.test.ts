import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const readWorkflow = (path: string) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

describe("independent workflow concurrency", () => {
  it("keys governed change, plan, and evidence runs by their task branch", () => {
    const governed = readWorkflow(".github/workflows/governed-change.yml");
    const plan = readWorkflow(".github/workflows/plan-gate.yml");
    const publisher = readWorkflow(".github/workflows/publish-evidence.yml");

    expect(governed).toContain(
      "group: ${{ github.workflow }}-${{ github.event.pull_request.head.ref || github.ref }}",
    );
    expect(plan).toContain(
      "group: ${{ github.workflow }}-${{ github.event.pull_request.head.ref }}",
    );
    expect(publisher).toContain(
      "group: ${{ github.workflow }}-${{ github.event.workflow_run.head_branch }}",
    );
    expect(governed).toContain("cancel-in-progress: true");
    expect(plan).toContain("cancel-in-progress: true");
    expect(publisher).toContain("cancel-in-progress: true");
  });

  it("scopes workflow concurrency without globally serializing independent tasks", () => {
    const production = readWorkflow(".github/workflows/production-gate.yml");
    const maintenance = readWorkflow(".github/workflows/system-maintenance-approval.yml");

    expect(production).toContain("group: production");
    expect(production).toContain("cancel-in-progress: false");
    expect(maintenance).toContain(
      "group: system-maintenance-${{ inputs.head-sha }}",
    );
    expect(maintenance).toContain("cancel-in-progress: false");
    expect(production).not.toMatch(/group:\s*["']?(?:northstar|agentic|all-tasks)["']?\s*$/im);
  });
});
