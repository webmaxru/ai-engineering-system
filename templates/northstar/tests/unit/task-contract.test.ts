import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contractFromFile,
  matchesPattern,
  parseIssueBody,
  splitSections,
  taskScope,
} from "../../scripts/task-contract.mjs";
import { resolveIssueNumber } from "../../scripts/session-start.mjs";

const SEED = "tests/fixtures/WI-1842.issue.md";

/**
 * The contract lives in the issue. These tests parse the seed file, which is
 * the text used to create that issue, so a template change the parser cannot
 * read fails CI instead of failing on stage.
 */
describe("parsing a task contract out of an issue body", () => {
  const contract = contractFromFile(SEED);

  it("reads Learn's three sections", () => {
    expect(contract.inputs.scope.allowed).toEqual(["src/**", "tests/**", "migrations/**"]);
    expect(contract.inputs.authoritativeSources).toContain("docs/adr/007-durable-idempotency.md");
    expect(contract.outputs.map((o) => o.id)).toEqual(["plan", "changeset", "evidence"]);
    expect(contract.successCriteria).toHaveLength(6);
  });

  it("maps every criterion to the test that proves it", () => {
    for (const criterion of contract.successCriteria) {
      expect(criterion.id).toMatch(/^AC\d+$/);
      expect(criterion.statement.length).toBeGreaterThan(10);
      expect(criterion.provenBy, `${criterion.id} has no proving test`).toBeTruthy();
    }
  });

  it("records where the contract came from", () => {
    expect(contract.source.kind).toContain("fixture file");
    expect(contract.source.issue).toBeNull();
    expect(contract.source.trusted).toBe(false);
    expect(contract.source.bodyDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("carries prohibited scope and stop conditions", () => {
    expect(contract.inputs.scope.prohibited).toContain("deployment configuration");
    expect(contract.stopConditions.length).toBeGreaterThanOrEqual(5);
  });

  it("exposes scope to the authorizer and fails closed when unresolved", () => {
    expect(taskScope(contract).allowed).toContain("src/**");
    expect(taskScope(null).allowed).toEqual([]);
  });

  it("carries validation, rollout, and non-goal inputs", () => {
    expect(contract.inputs.validationExpectations).toContain(
      "PostgreSQL acceptance tests across two service instances",
    );
    expect(contract.inputs.rolloutExpectations).toContain(
      "no production deployment is part of this task",
    );
    expect(contract.inputs.nonGoals).toContain(
      "authentication and authorization changes",
    );
  });
});

describe("parser handles real GitHub issue-form output", () => {
  // GitHub returns bodies with CRLF; the seed file may be checked out either
  // way. Normalize here so these fixtures exercise the parser, not the shell.
  const seedBody = readFileSync(SEED, "utf8").replace(/\r\n?/g, "\n");

  it("normalizes CRLF bodies from the GitHub API", () => {
    const crlf = seedBody.replace(/\n/g, "\r\n");
    expect(parseIssueBody(crlf).successCriteria).toHaveLength(6);
  });

  it("treats unanswered optional fields as empty", () => {
    const body = seedBody.replace(
      /### Prohibited scope\n\n[\s\S]*?(?=\n### )/,
      "### Prohibited scope\n\n_No response_\n\n",
    );

    expect(parseIssueBody(body).inputs.scope.prohibited).toEqual([]);
  });

  it("tolerates bulleted lines, which the form editor may add", () => {
    const sections = splitSections("### Allowed scope\n\n- src/**\n- tests/**\n");
    expect(sections["allowed scope"]).toContain("src/**");
  });

  it("refuses a body that is not the agent-task template", () => {
    expect(() => parseIssueBody("Please fix the duplicate orders bug, thanks!")).toThrow(
      /missing required section/i,
    );
  });

  it("refuses success criteria that name no proving test", () => {
    const body = seedBody.replace(
      /### Success criteria\n\n[\s\S]*?(?=\n### )/,
      "### Success criteria\n\nIt should work properly\n\n",
    );

    expect(() => parseIssueBody(body)).toThrow(/ID \| statement \| proving test/);
  });
});

describe("the active task is given, never inferred", () => {
  it("reads the one explicit source, for non-interactive runs", () => {
    expect(resolveIssueNumber({ env: { AGENT_TASK_ISSUE: "42" } })).toEqual({
      number: 42,
      how: "AGENT_TASK_ISSUE",
    });
  });

  it("infers nothing from a branch that names a task", () => {
    // Branch-name matching used to resolve this. It was usually right, which is
    // exactly why nobody checked it - and being governed by the wrong contract
    // is worse than being told no contract is active.
    expect(resolveIssueNumber({ env: {} })).toEqual({ number: null, how: "nothing" });
  });

  it("never adopts the only open agent-task issue", () => {
    // A workspace hook fires on every session, including chats about something
    // else. Adopting a task nobody named cost a network round trip and governed
    // unrelated work.
    expect(resolveIssueNumber({ env: {} }).number).toBeNull();
  });
});

describe("scope glob semantics", () => {
  it("keeps a single-star directory glob to one path segment", () => {
    expect(matchesPattern("src/file.ts", "src/*")).toBe(true);
    expect(matchesPattern("src/deep/file.ts", "src/*")).toBe(false);
  });

  it("uses double-star for recursive descendants", () => {
    expect(matchesPattern("src/deep/file.ts", "src/**")).toBe(true);
  });
});