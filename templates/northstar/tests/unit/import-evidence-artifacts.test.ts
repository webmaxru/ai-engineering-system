import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importEvidenceArtifacts } from "../../scripts/import-evidence-artifacts.mjs";

const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function temp(): string {
  const path = mkdtempSync(join(tmpdir(), "northstar-evidence-"));
  temporary.push(path);
  return path;
}

describe("isolated evidence import", () => {
  it("copies only allowlisted evidence into artifacts", () => {
    const source = temp();
    const destination = temp();
    writeFileSync(join(source, "unit-junit.xml"), "<testsuites />");
    mkdirSync(join(source, "checks"));
    writeFileSync(join(source, "checks", "quality.json"), "{}");

    expect(importEvidenceArtifacts(source, destination)).toEqual([
      "artifacts/unit-junit.xml",
    ]);
    expect(
      readFileSync(join(destination, "artifacts", "unit-junit.xml"), "utf8"),
    ).toBe("<testsuites />");
  });

  it("rejects files that could overwrite trusted publisher code", () => {
    const source = temp();
    const destination = temp();
    mkdirSync(join(source, "scripts"));
    writeFileSync(join(source, "scripts", "publish-evidence.mjs"), "malicious");

    expect(() => importEvidenceArtifacts(source, destination)).toThrow(
      /unexpected paths.*scripts\/publish-evidence\.mjs/,
    );
  });

  it("restores trusted maintenance evidence without allowing source files", () => {
    const source = temp();
    const destination = temp();
    mkdirSync(join(source, "artifacts", "checks"), { recursive: true });
    writeFileSync(
      join(source, "artifacts", "checks", "quality.json"),
      "{}",
    );
    writeFileSync(
      join(source, "artifacts", "approved-plan.json"),
      "{}",
    );

    expect(
      importEvidenceArtifacts(source, destination, { maintenance: true }),
    ).toEqual([
      "artifacts/approved-plan.json",
      "artifacts/checks/quality.json",
    ]);
  });
});
