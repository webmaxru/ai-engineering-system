import { mkdtempSync, rmSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { workspacePath } from "../../scripts/workspace-path.mjs";

const roots: string[] = [];

function temp() {
  const root = mkdtempSync(join(tmpdir(), "northstar-workspace-path-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workspace artifact paths", () => {
  it("confines artifact paths to their owning execution context", () => {
    const root = temp();
    const otherRoot = temp();
    expect(workspacePath("artifacts/task-contract.json", root))
      .toBe(join(root, "artifacts", "task-contract.json"));
    expect(workspacePath("artifacts/task-contract.json", otherRoot))
      .toBe(join(otherRoot, "artifacts", "task-contract.json"));
    expect(() => workspacePath("../outside.json", root)).toThrow(/stay inside the repository/);
    expect(() => workspacePath(join(tmpdir(), "outside.json"), root))
      .toThrow(/stay inside the repository/);
  });

  it("rejects an artifact path that crosses a symlink", () => {
    const root = temp();
    const repository = join(root, "repository");
    const outside = join(root, "outside");
    mkdirSync(repository);
    mkdirSync(outside);
    symlinkSync(outside, join(repository, "artifacts"), process.platform === "win32" ? "junction" : "dir");

    expect(() => workspacePath("artifacts/task-contract.json", repository))
      .toThrow(/symbolic link/);
  });
});
