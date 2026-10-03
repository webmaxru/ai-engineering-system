import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanText, scanTrackedFiles } from "../../scripts/secret-scan.mjs";

const temporary: string[] = [];
function temp() {
  const root = mkdtempSync(join(tmpdir(), "northstar-secret-scan-"));
  temporary.push(root);
  return root;
}
afterEach(() => temporary.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("supplemental secret scan", () => {
  it("detects high-confidence token and private-key formats", () => {
    expect(
      scanText(
        [
          `token=${"github"}${"_pat_"}1234567890abcdefghij`,
          `-----BEGIN ${"PRIVATE"} KEY-----`,
        ].join("\n"),
        "fixture.txt",
      ),
    ).toEqual([
      { id: "github-fine-grained-token", file: "fixture.txt", line: 1 },
      { id: "private-key", file: "fixture.txt", line: 2 },
    ]);
  });

  it("does not flag ordinary configuration placeholders", () => {
    expect(
      scanText("DATABASE_URL=postgres://postgres:postgres@localhost/demo"),
    ).toEqual([]);
  });

  it("rejects unreadable files instead of silently skipping them", () => {
    const root = temp();
    writeFileSync(join(root, "readable.txt"), "ordinary text");
    expect(() => scanTrackedFiles(["readable.txt", "missing.txt"], { root }))
      .toThrow(/Secret scan incomplete: 1 unreadable/);
    expect(() => scanTrackedFiles(["readable.txt"], {
      root, read: () => { throw Object.assign(new Error("private diagnostic must not be logged"), { code: "EACCES" }); },
    })).toThrow(/Secret scan incomplete/);
  });

  it("reports incomplete scanning even when a readable file already contains a finding", () => {
    const root = temp();
    writeFileSync(join(root, "token.txt"), ["gh", "p_", "a".repeat(24)].join(""));
    let failure: unknown;
    try {
      scanTrackedFiles(["missing.txt", "token.txt"], { root });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error("Expected an explicit aggregate scan failure.");
    expect(failure.message).toContain("1 finding(s) in readable inputs");
    expect(failure.errors.map((error: Error) => error.message).join("\n")).not.toContain("a".repeat(24));
  });

  it("does not read out-of-root paths, directories, or an empty source set", () => {
    const root = temp();
    mkdirSync(join(root, "directory"));
    for (const files of [[], ["../outside"], ["directory"]]) {
      expect(() => scanTrackedFiles(files, { root })).toThrow();
    }
  });

  it("scans every readable input once and returns payload-free findings", () => {
    const root = temp();
    writeFileSync(join(root, "first.txt"), "ordinary text");
    writeFileSync(join(root, "second.txt"), ["sk", "-", "b".repeat(24)].join(""));
    const reads: string[] = [];
    expect(scanTrackedFiles(["first.txt", "second.txt", "second.txt"], {
      root, read: (file) => { reads.push(file); return readFileSync(file, "utf8"); },
    })).toEqual([{ id: "openai-key", file: "second.txt", line: 1 }]);
    expect(reads).toHaveLength(2);
  });
});
