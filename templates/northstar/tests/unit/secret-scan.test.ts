import { describe, expect, it } from "vitest";
import { scanText } from "../../scripts/secret-scan.mjs";

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
});
