import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "aes-verifier-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (relative, content) => {
    const target = path.join(directory, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  const lock = JSON.parse(readFileSync(path.join(root, "architecture-lock.json"), "utf8"));
  lock.auditedReference.status = "accepted";
  lock.conformance = { status: "conformant", blockingReferenceChanges: [] };
  write("architecture-lock.json", JSON.stringify(lock));
  for (const file of lock.requiredAuthorityDocuments) {
    write(file, path.basename(lock.guide.path));
  }
  write(lock.guide.path, readFileSync(path.join(root, lock.guide.path)));
  write("docs/TECHNICAL-EXTENSIONS.md", readFileSync(path.join(root, "docs", "TECHNICAL-EXTENSIONS.md")));
  for (const entry of lock.extensionCoverage) {
    for (const file of entry.evidencePaths) {
      if (!file.endsWith(".md") && !file.startsWith("tools/")) write(file, "");
    }
  }
  write("templates/northstar/reference-lock.json", JSON.stringify({
    sourceCommit: lock.auditedReference.commit,
    releaseStatus: "accepted",
  }));
  write("tools/verify-reference.ps1", 'Write-Output "Synthetic reference fixture only"\n');
  copyFileSync(path.join(root, "tools", "verify-architecture.ps1"), path.join(directory, "tools", "verify-architecture.ps1"));
  // Coverage paths refer to verifier sources, not runtime Northstar evidence.
  for (const entry of lock.extensionCoverage) {
    for (const file of entry.evidencePaths.filter((file) => file.startsWith("tools/"))) {
      if (!["tools/verify-architecture.ps1", "tools/verify-reference.ps1"].includes(file)) write(file, "");
    }
  }
  const git = spawnSync("git", ["init", "--quiet", directory], { encoding: "utf8" });
  assert.equal(git.status, 0, git.stderr);
  return {
    write,
    run() {
      return spawnSync("pwsh", ["-NoProfile", "-File", path.join(directory, "tools", "verify-architecture.ps1")], {
        cwd: directory,
        encoding: "utf8",
      });
    },
  };
}

test("permits ordinary documentation publishing without activating the system", (t) => {
  const repo = fixture(t);
  repo.write(".github/workflows/docs.yml", readFileSync(path.join(root, ".github", "workflows", "docs.yml")));
  const result = repo.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Architecture authority/);
});

for (const file of [".github/hooks/control.json", ".github/agents/plan.agent.md",
  ".github/workflows/governed-change.yml", ".github/workflows/nested/docs.yml"]) {
  test(`rejects active or unapproved control path ${file}`, (t) => {
    const repo = fixture(t);
    repo.write(file, "{}");
    const result = repo.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not activate|permits only/);
  });
}

test("checks untracked documentation for unknown extensions", (t) => {
  const repo = fixture(t);
  repo.write("docs/new-document.md", "EXT-999");
  const result = repo.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXT-999/);
});

test("does not scan ignored dependencies or inert snapshot Markdown", (t) => {
  const repo = fixture(t);
  repo.write(".gitignore", "node_modules/\n");
  repo.write("node_modules/example/README.md", "EXT-999");
  repo.write("templates/northstar/example.md", "EXT-999");
  const result = repo.run();
  assert.equal(result.status, 0, result.stderr);
});
