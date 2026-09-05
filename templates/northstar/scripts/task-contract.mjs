/**
 * Resolve the task contract from the issue that defines it.
 *
 * Microsoft Learn puts the contract in the issue: "success criteria should be
 * defined in the issue or pull request... Write acceptance criteria directly in
 * the issue, reference those criteria in the pull request, and use them as the
 * basis for validation."
 *
 * So the repository stores no live contract. It stores the issue template that
 * gives the contract its shape, plus offline test fixtures. The parsed result
 * is cached in artifacts/ (gitignored) so the repository never becomes the
 * source of truth.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
export const CONTRACT_CACHE = "artifacts/task-contract.json";

/** No autonomous write is valid until a precise task contract is active. */
export const DEFAULT_SCOPE = {
  allowed: [],
  prohibited: [],
};

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/** Split a GitHub issue-form body into its `### Heading` sections. */
export function splitSections(body) {
  // GitHub returns issue bodies with CRLF. Normalize before anything else so
  // headings do not end up with a trailing carriage return.
  const text = String(body ?? "").replace(/\r\n?/g, "\n");
  const sections = {};
  const pattern = /^###[ \t]+(.+?)[ \t]*$/gm;
  const matches = [...text.matchAll(pattern)];

  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    sections[match[1].trim().toLowerCase()] = text.slice(start, end).trim();
  });

  return sections;
}

function lines(value) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 0 && line !== "_No response_");
}

function pipeRows(value, arity) {
  return lines(value)
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length >= arity);
}

/**
 * Parse an issue body into a task contract.
 *
 * @param {string} body
 * @param {{number?: number, url?: string, source?: string}} [origin]
 */
export function parseIssueBody(body, origin = {}) {
  const sections = splitSections(body);
  const constraints = sections["constraints and non-goals"] ?? sections.constraints;
  const missing = [
    "task id",
    "goal",
    "authoritative sources",
    "allowed scope",
    "outputs",
    "success criteria",
    "stop conditions",
  ].filter((name) => !sections[name]);
  if (!constraints) missing.push("constraints and non-goals");
  if (missing.length > 0) {
    throw new Error(
      `Issue body is missing required section(s): ${missing.join(", ")}. It must follow .github/ISSUE_TEMPLATE/agent-task.yml.`,
    );
  }

  const successCriteria = pipeRows(sections["success criteria"], 3).map(
    ([id, statement, provenBy]) => ({ id, statement, provenBy }),
  );
  if (successCriteria.length === 0) {
    throw new Error(
      'No success criteria could be parsed. Each line must read "ID | statement | proving test".',
    );
  }

  const normalizedBody = String(body ?? "").replace(/\r\n?/g, "\n");
  const bodyDigest = createHash("sha256").update(normalizedBody).digest("hex");
  const validationExpectations = lines(sections["validation expectations"]);
  const rolloutExpectations = lines(sections["rollout expectations"]);

  return {
    schema: "northstar/task-contract/3",
    id: lines(sections["task id"])[0],
    title: lines(sections.goal)[0],
    source: {
      kind: origin.source ?? "unknown",
      issue: origin.number ?? null,
      url: origin.url ?? null,
      actor: origin.actor ?? null,
      association: origin.association ?? null,
      trusted: origin.trusted ?? false,
      createdAt: origin.createdAt ?? null,
      updatedAt: origin.updatedAt ?? null,
      bodyDigest,
      resolvedAt: new Date().toISOString(),
    },
    inputs: {
      goal: sections.goal,
      authoritativeSources: lines(sections["authoritative sources"]),
      scope: {
        allowed: lines(sections["allowed scope"]),
        prohibited: lines(sections["prohibited scope"]),
      },
      constraints: lines(constraints),
      nonGoals: lines(sections["non-goals"]),
      validationExpectations:
        validationExpectations.length > 0
          ? validationExpectations
          : successCriteria.map(({ provenBy }) => provenBy),
      rolloutExpectations:
        rolloutExpectations.length > 0
          ? rolloutExpectations
          : ["Not specified in this legacy task contract."],
    },
    outputs: pipeRows(sections.outputs, 2).map(([id, description]) => ({ id, description })),
    successCriteria,
    stopConditions: lines(sections["stop conditions"]),
  };
}

/** Read the contract from a live GitHub issue. */
export function contractFromIssue(issueNumber) {
  const env = { ...process.env };
  if (!env.GH_TOKEN && env.GITHUB_COPILOT_GIT_TOKEN) {
    env.GH_TOKEN = env.GITHUB_COPILOT_GIT_TOKEN;
  }
  const raw = execFileSync(
    "gh",
    ["api", `repos/{owner}/{repo}/issues/${issueNumber}`],
    { encoding: "utf8", env },
  );
  const issue = JSON.parse(raw);
  const labels = (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
  if (!labels.includes("agent-task")) {
    throw new Error(`Issue #${issue.number} is not labeled agent-task.`);
  }
  if (!TRUSTED_ASSOCIATIONS.has(issue.author_association)) {
    throw new Error(
      `Issue #${issue.number} was authored by an untrusted association (${issue.author_association ?? "unknown"}).`,
    );
  }
  return parseIssueBody(issue.body, {
    number: issue.number,
    url: issue.html_url,
    actor: issue.user?.login,
    association: issue.author_association,
    trusted: true,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    source: `issue #${issue.number}`,
  });
}

/** Read an explicitly untrusted contract fixture for tests or offline demos. */
export function contractFromFile(path) {
  const absolute = resolve(REPO_ROOT, path);
  return parseIssueBody(readFileSync(absolute, "utf8"), {
    source: `fixture file ${path}`,
    trusted: false,
  });
}

export function cacheContract(contract, cachePath = CONTRACT_CACHE) {
  const target = resolve(REPO_ROOT, cachePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  return target;
}

/** The contract resolved by the last `contract:fetch`, or null. */
export function loadTaskContract(cachePath = CONTRACT_CACHE) {
  const target = resolve(REPO_ROOT, cachePath);
  return existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : null;
}

/** The scope a contract grants, or the repository default when there is none. */
export function taskScope(contract) {
  return contract?.inputs?.scope ?? DEFAULT_SCOPE;
}

/** Turn a scope glob such as "src/**" into a path prefix. */
export function scopePrefixes(scope) {
  const allowed = scope?.allowed ?? DEFAULT_SCOPE.allowed;
  return allowed.map((pattern) => pattern.replace(/\*+$/, "").replace(/\/+$/, "/"));
}

/**
 * Does this prohibition name a path, or a concept?
 *
 * An issue may prohibit "deployment configuration" or "src/api/**". The first
 * is a semantic rule a reviewer applies; the second is something a path check
 * can enforce. Treating them alike would either ignore real boundaries or claim
 * to enforce sentences.
 */
export function isPathPattern(entry) {
  const text = String(entry ?? "").trim();
  if (!text || /\s/.test(text.replace(/\s*,\s*/g, ""))) {
    // Contains whitespace between words: prose, not a path.
    return /[/*]/.test(text) && !/\s/.test(text);
  }
  return /[/*]/.test(text) || /\.[A-Za-z0-9]+$/.test(text);
}

/** Prohibitions a path check can enforce, and those only a human can. */
export function splitProhibitions(scope) {
  const entries = scope?.prohibited ?? [];
  return {
    paths: entries.filter(isPathPattern),
    advisory: entries.filter((entry) => !isPathPattern(entry)),
  };
}

/**
 * Match a path against a prohibition pattern.
 * Supports `dir/**`, exact paths, and `**\/*.ext` suffix patterns.
 */
export function matchesPattern(filePath, pattern) {
  const path = String(filePath).replace(/\\/g, "/").replace(/^\.\//, "");
  const raw = String(pattern).trim().replace(/^\.\//, "");

  if (raw === "**" || raw === "*") {
    return true;
  }
  if (raw.startsWith("**/")) {
    const suffixPattern = raw.slice(3);
    return matchesPattern(path, suffixPattern) ||
      path.split("/").some((_, index, parts) =>
        matchesPattern(parts.slice(index).join("/"), suffixPattern),
      );
  }
  if (raw.endsWith("/**")) {
    const prefix = raw.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (raw.endsWith("/*")) {
    const prefix = raw.slice(0, -2);
    if (!path.startsWith(`${prefix}/`)) return false;
    return !path.slice(prefix.length + 1).includes("/");
  }
  if (raw.includes("*")) {
    const expression = raw
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "__DOUBLE_STAR__")
      .replace(/\*/g, "[^/]*");
    return new RegExp(`^${expression.replace(/__DOUBLE_STAR__/g, ".*")}$`).test(path);
  }
  return path === raw || path.startsWith(`${raw}/`);
}

export function isPathAllowed(filePath, scope) {
  const allowed = scope?.allowed ?? [];
  const { paths: prohibited } = splitProhibitions(scope);
  return (
    allowed.some((pattern) => matchesPattern(filePath, pattern)) &&
    !prohibited.some((pattern) => matchesPattern(filePath, pattern))
  );
}
