import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Durable context is loaded for every task. If any of it names a work item,
 * every future task starts by reading something irrelevant to it - and does so
 * silently.
 *
 * Task identity belongs in the issue. The demo seed recreates it, and the
 * generic prompts accept its issue number; none are durable context.
 */
const DURABLE_CONTEXT = [
  "AGENTS.md",
  ...globSync(".github/agents/*.agent.md"),
  ...globSync(".github/instructions/*.instructions.md"),
];

const WORK_ITEM_PATTERN = /\bWI-\d+\b/;

function isolatedRepositoryIdentity(readme: string) {
  const repositoryLinks = [
    ...readme.matchAll(
      /\[[^\]]+\]\((https:\/\/github\.com\/[^)\s]+)\)/gi,
    ),
  ];
  if (repositoryLinks.length !== 1) return null;

  const [canonicalLink, repositoryUrl] = repositoryLinks[0] ?? [];
  if (!canonicalLink || !repositoryUrl) return null;

  const identity = new URL(repositoryUrl).pathname.replace(/^\/|\/$/g, "");
  const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const remainingReadme = readme.replace(canonicalLink, "");
  return new RegExp(escaped, "i").test(remainingReadme) ? null : identity;
}

describe("durable context is task-agnostic", () => {
  it("covers every durable context file", () => {
    expect(DURABLE_CONTEXT.length).toBeGreaterThanOrEqual(6);
  });

  it.each(DURABLE_CONTEXT)("%s names no work item", (file) => {
    const offending = readFileSync(file, "utf8")
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter((entry) => WORK_ITEM_PATTERN.test(entry.line));

    expect(
      offending,
      `${file} names a work item. Move task-specific detail into the task issue.`,
    ).toEqual([]);
  });

  it("keeps workflows free of hardcoded task identity", () => {
    // A workflow that names one task grades every unlinked pull request against
    // it, which is the same failure as durable context naming a task.
    for (const workflow of globSync(".github/workflows/*.yml")) {
      const body = readFileSync(workflow, "utf8");
      const codeOnly = body
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      expect(WORK_ITEM_PATTERN.test(codeOnly), `${workflow} hardcodes a work item`).toBe(false);
    }
  });

  it("keeps enforcement scripts free of hardcoded task identity", () => {
    for (const script of ["scripts/authorize-tool.mjs", "scripts/build-execution-report.mjs"]) {
      const body = readFileSync(script, "utf8");
      const codeOnly = body
        .split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
        .join("\n");
      expect(WORK_ITEM_PATTERN.test(codeOnly), `${script} hardcodes a work item`).toBe(false);
    }
  });
});

/**
 * AGENTS.md is the only hand-authored durable file. The Copilot-specific copy
 * exists because GitHub's support matrix does not yet read AGENTS.md on every
 * surface, so it is generated rather than maintained.
 */
describe("the harness-specific instructions file is generated, not authored", () => {
  const generated = readFileSync(".github/copilot-instructions.md", "utf8").replace(/\r\n?/g, "\n");

  it("is marked as generated", () => {
    expect(generated).toMatch(/GENERATED FILE - DO NOT EDIT/);
    expect(generated).toMatch(/npm run instructions:sync/);
  });

  it("contains exactly the AGENTS.md content", () => {
    const source = readFileSync("AGENTS.md", "utf8").replace(/\r\n?/g, "\n").trimEnd();
    expect(generated.endsWith(`${source}\n`)).toBe(true);
  });

  it("cites the support matrix so the shim can be retired deliberately", () => {
    expect(generated).toMatch(/custom-instructions-support/);
  });
});

describe("canonical guide terminology", () => {
  const instructions = readFileSync("AGENTS.md", "utf8");
  const readme = readFileSync("README.md", "utf8");

  it("uses the guide's canonical terms in durable context", () => {
    expect(instructions).toContain("plan → act → evaluate");
    expect(instructions).toMatch(/system of record and control plane/i);
    expect(instructions).toMatch(/contributor model/i);
    expect(instructions).toMatch(/MCP allow list/i);
  });

  it("uses the guide's canonical terms in the reference README", () => {
    expect(readme).toContain("plan → act → evaluate");
    expect(readme).toMatch(/system of record and control plane/i);
    expect(readme).toMatch(/contributor model/i);

    const repositoryIdentity = isolatedRepositoryIdentity(readme);
    expect(repositoryIdentity).not.toBeNull();
    if (!repositoryIdentity) {
      throw new Error("README.md does not have one isolated repository link");
    }

    const outsideReadme = spawnSync(
      "git",
      ["grep", "-i", "-l", "-F", repositoryIdentity, "--", ":!README.md"],
      { encoding: "utf8" },
    );
    expect([0, 1]).toContain(outsideReadme.status);
    expect(outsideReadme.stdout.trim()).toBe("");
  });

  it("rejects every extra repository reference beside the canonical link", () => {
    const canonical = "[framework](https://github.com/owner/repository)";
    expect(isolatedRepositoryIdentity(canonical)).toBe("owner/repository");

    for (const reference of [
      "git@github.com:owner/repository.git",
      "ssh://git@github.com/owner/repository",
      "git+ssh://git@github.com/owner/repository.git",
      "git://github.com/owner/repository",
      "git+https://github.com/owner/repository",
      "http://github.com/owner/repository",
      "github:owner/repository",
      "https://github.com/owner/repository.git",
    ]) {
      expect(isolatedRepositoryIdentity(`${canonical}\n${reference}`)).toBeNull();
    }
  });
});
