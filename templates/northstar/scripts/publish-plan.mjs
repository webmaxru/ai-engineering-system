/**
 * Publish the plan as the description of a plan-first pull request.
 *
 * Microsoft Learn, "Separate planning, reasoning, and execution", Option A:
 *
 *   - A plan is generated.
 *   - The agent opens a pull request that contains only the plan (no code
 *     changes yet).
 *   - Reviewers discuss, refine, and approve the plan directly in the PR.
 *   - After approval, the agent proceeds to implement the plan in follow-up
 *     commits or a new PR.
 *
 * https://learn.microsoft.com/en-us/training/modules/design-agent-architecture-integration/4-plan-reason-execution
 *
 * The issue stays what Learn calls it - context and intent, the task contract.
 * The plan is a proposal about that intent, so it belongs where proposals are
 * reviewed. That also makes approval a real GitHub review event with a person
 * attached, rather than a thumbs-up on a comment.
 *
 * Usage:
 *   node scripts/publish-plan.mjs --file plan.md
 *   node scripts/publish-plan.mjs < plan.md
 *   node scripts/publish-plan.mjs --show
 *   node scripts/publish-plan.mjs --base <branch>
 *   node scripts/publish-plan.mjs --transcript <path>   (used by the Stop hook)
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import { loadTaskContract } from "./task-contract.mjs";
import { canonicalPlan, extractPlanContract, planDigest, validatePlanContract } from "./plan-contract.mjs";
import {
  evaluateNativePlanApproval,
  evaluatePlanApproval,
  parseApprovalRecord,
} from "./plan-approval.mjs";
import { githubJson, githubPages, runGitHub } from "./github-api.mjs";
import { planArtifactPath, readPlanArtifact, validatePlanOnlyFiles } from "./plan-artifact.mjs";
import { approvalPolicyForRisk, GOVERNANCE_POLICY } from "./risk-policy.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const MARKER = "<!-- northstar:plan -->";
export const PLAN_HEADING = "## Plan (required)";

// The plan carries its own `## ` headings, so the section cannot be delimited by
// "the next heading" - that would truncate the plan at its first subheading.
// These comments are invisible in rendered Markdown and unambiguous to parse.
const PLAN_START = "<!-- northstar:plan:start -->";
const PLAN_END = "<!-- northstar:plan:end -->";

/** The branch a plan-first PR is opened from. */
export function planBranch(taskId, canary = false) {
  return `plan/${String(taskId).toLowerCase()}${canary ? "-canary" : ""}`;
}

export function implementationBranch(taskId) {
  return `agent/implement/${String(taskId).toLowerCase()}`;
}

/**
 * The PR description carries the complete reviewable plan. Evidence entries in
 * a plan-only PR are expectations, not claims that execution already occurred.
 */
export function renderPlan(body, meta = {}) {
  return [
    MARKER,
    meta.issue ? `Closes #${meta.issue}` : "",
    "",
    PLAN_HEADING,
    "",
    `Plan proposed${meta.at ? ` at ${meta.at}` : ""}. No implementation changes; publication is not approval.`,
    "",
    PLAN_START,
    String(body).trim(),
    PLAN_END,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Pull the plan back out of a PR description, or null if there is none. */
export function extractPlanSection(prBody) {
  const text = String(prBody ?? "");

  const start = text.indexOf(PLAN_START);
  if (start !== -1) {
    const end = text.indexOf(PLAN_END, start);
    const section = text
      .slice(start + PLAN_START.length, end === -1 ? undefined : end)
      .trim();
    return section.length > 0 ? section : null;
  }

  // A human-written PR that used the template has the heading but no markers.
  const heading = text.indexOf(PLAN_HEADING);
  if (heading === -1) return null;
  const after = text.slice(heading + PLAN_HEADING.length);
  const next = after.search(/\n## /);
  const section = (next === -1 ? after : after.slice(0, next)).trim();
  return section.length > 0 ? section : null;
}

/**
 * Pull the final assistant message out of a session transcript.
 *
 * VS Code documents `transcript_path` but warns the file format "is not a
 * stable hook API and may change". So this tries the shapes we know, and
 * returns null rather than guessing when none fit - the caller then tells the
 * human how to publish manually instead of silently persisting nothing.
 */
export function extractPlan(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const looksLikeMessage = (value) =>
    Boolean(value) &&
    typeof value === "object" &&
    ("role" in value || "type" in value);

  // JSON Lines: one message object per line.
  let messages = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      messages.push(JSON.parse(trimmed));
    } catch {
      // not JSONL, fall through
    }
  }

  // A single JSON document parses as one "line", so its envelope would look
  // like a message. Fall back to the document shape unless the parsed objects
  // actually carry a role.
  if (!messages.some(looksLikeMessage)) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : (parsed.messages ?? parsed.turns ?? []);
      messages = Array.isArray(list) ? list : [];
    } catch {
      return null;
    }
  }

  const assistant = messages
    .filter((m) =>
      ["assistant", "model", "agent"].includes(
        String(m?.role ?? m?.type ?? ""),
      ),
    )
    .map((m) => {
      const content = m.content ?? m.text ?? m.message ?? "";
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
          .join("");
      }
      return "";
    })
    .filter((body) => body.trim().length > 0);

  return assistant.length > 0 ? assistant[assistant.length - 1] : null;
}

function gh(args) {
  return runGitHub(args);
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
    input: options.input,
  });
}

/** The open PR carrying this task's plan, or null. */
export function findPlanPr(taskId, { run = gh, canary = false } = {}) {
  const raw = run([
    "pr",
    "list",
    "--head",
    planBranch(taskId, canary),
    "--state",
    "open",
    "--limit",
    "2",
    "--json",
    "number",
  ]);
  const list = JSON.parse(raw);
  if (!Array.isArray(list) || list.length > 1) {
    throw new Error("The task must resolve to exactly one open plan pull request.");
  }
  return list.length > 0 ? planPrByNumber(Number(list[0].number), { run }) : null;
}

function planPrByNumber(number, { run = gh } = {}) {
  const pull = githubJson(`repos/{owner}/{repo}/pulls/${number}`, { run });
  if (pull.number !== number || !pull.user?.login || !pull.head?.sha || !pull.base?.sha ||
      !pull.head?.repo?.full_name || !pull.base?.repo?.full_name) {
    return null;
  }
  return {
    number: pull.number,
    body: pull.body ?? "",
    url: pull.html_url,
    author: { login: pull.user.login },
    headRefOid: pull.head.sha,
    baseRefOid: pull.base.sha,
    headRefName: pull.head.ref,
    baseRefName: pull.base.ref,
    headRepoFullName: pull.head.repo?.full_name ?? null,
    baseRepoFullName: pull.base.repo?.full_name ?? null,
    isDraft: pull.draft,
    state: pull.state,
  };
}

/**
 * The branch the plan-first PR targets.
 *
 * The current branch, not the default branch. The plan proposes a change to the
 *     code you are looking at. The later implementation branch is created from
 *     the same approved base SHA; the plan branch remains plan-only.
 *
 * Falls back to the default branch when HEAD is detached.
 */
export function resolveBase(vcs, override) {
  if (override) return String(override).replace(/^origin\//, "");

  const head = vcs(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (head && head !== "HEAD") return head.replace(/^origin\//, "");

  return vcs(["rev-parse", "--abbrev-ref", "origin/HEAD"])
    .trim()
    .replace(/^origin\//, "");
}

export function configuredPlanReviewers(author, {
  run = gh,
  reviewers = GOVERNANCE_POLICY.planApproval?.reviewers,
} = {}) {
  if (!Array.isArray(reviewers) || reviewers.length === 0 ||
      !reviewers.every((login) => typeof login === "string" && /^[a-z\d][a-z\d-]{0,38}$/i.test(login))) {
    throw new Error("Configure explicit human plan reviewers in governance policy before publication.");
  }
  const candidates = [...new Set(reviewers.map((login) => login.toLowerCase()))]
    .filter((login) => login !== String(author).toLowerCase());
  if (candidates.length === 0) throw new Error("No configured reviewer is independent of the PR author.");
  return candidates.map((login) => {
    const permission = githubJson(
      `repos/{owner}/{repo}/collaborators/${encodeURIComponent(login)}/permission`,
      { run },
    );
    if (
      permission.user?.type !== "User" ||
      permission.user?.login?.toLowerCase() !== login ||
      !["write", "maintain", "admin"].includes(permission.permission)
    ) {
      throw new Error(`Configured plan reviewer ${login} is not an eligible human collaborator.`);
    }
    return permission.user.login;
  });
}

function isLegacyPlan(pr, plan, contract, legacyPlans) {
  return (legacyPlans ?? []).some((legacy) =>
    legacy.pr === pr.number &&
    pr.url === `https://github.com/${legacy.repository}/pull/${legacy.pr}` &&
    legacy.headSha === pr.headRefOid &&
    legacy.baseSha === plan.baseSha &&
    legacy.contractDigest === contract.source.bodyDigest &&
    legacy.planDigest === planDigest(plan) &&
    pr.headRefName === planBranch(contract.id) &&
    pr.baseRefName === plan.baseBranch
  );
}

/** Materialize only the plan, without touching the caller's checkout or index. */
function commitPlan(contract, plan, body, existing, { vcs = git, base: baseOverride } = {}) {
  const branch = planBranch(contract.id, Boolean(plan.canaryFor));
  const base = resolveBase(vcs, baseOverride ?? plan.baseBranch);
  if (base !== plan.baseBranch || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(base)) {
    throw new Error("The publication base must match the validated plan branch.");
  }
  vcs(["fetch", "origin", base]);
  if (vcs(["rev-parse", `origin/${base}`]).trim() !== plan.baseSha) {
    throw new Error("The base changed; refresh the proposed plan before publishing.");
  }
  const parents = [plan.baseSha];
  if (existing) {
    vcs(["fetch", "origin", `refs/heads/${branch}`]);
    if (vcs(["rev-parse", "FETCH_HEAD"]).trim() !== existing.headRefOid) {
      throw new Error("The plan branch changed during publication.");
    }
    parents[0] = existing.headRefOid;
    try {
      vcs(["merge-base", "--is-ancestor", plan.baseSha, existing.headRefOid]);
    } catch (error) {
      if (error.status !== 1) throw error;
      parents.push(plan.baseSha);
    }
  }
  const directory = mkdtempSync(resolve(tmpdir(), "northstar-plan-index-"));
  const env = { GIT_INDEX_FILE: resolve(directory, "index") };
  try {
    const blob = vcs(["hash-object", "-w", "--stdin"], { input: `${body.trim()}\n` }).trim();
    if (!/^[0-9a-f]{40}$/.test(blob)) throw new Error("Git did not return a plan blob identity.");
    vcs(["read-tree", plan.baseSha], { env });
    vcs(["update-index", "--add", "--cacheinfo", `100644,${blob},${planArtifactPath(contract.id)}`], { env });
    const tree = vcs(["write-tree"], { env }).trim();
    const commit = vcs([
      "commit-tree", tree, ...parents.flatMap((parent) => ["-p", parent]),
      "-m", `${contract.id}: plan\n\nVersioned plan only; no implementation changes.\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`,
    ]).trim();
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("Git did not return a plan commit identity.");
    vcs(["push", "origin", `${commit}:refs/heads/${branch}`]);
    return { branch, base, commit };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Put the plan in the PR description, opening the plan-first PR if needed. */
export function publish(contract, body, deps = {}) {
  const run = deps.run ?? gh;
  if (contract.source?.trusted !== true) {
    throw new Error("Only a trusted live task contract may be published as a plan.");
  }
  const plan = extractPlanContract(body);
  const validation = validatePlanContract(plan, contract);
  if (!validation.ok) throw new Error(`Invalid proposed plan: ${validation.errors.join(" ")}`);
  planArtifactPath(contract.id);
  if (Buffer.byteLength(body, "utf8") > 1024 * 1024) {
    throw new Error("The proposed plan exceeds the 1 MiB review limit.");
  }
  const viewer = githubJson("user", { run });
  if (!viewer.login) throw new Error("The publishing identity could not be established.");
  const reviewers = configuredPlanReviewers(viewer.login, { ...deps, run });
  const rendered = renderPlan(body, {
    at: deps.at ?? new Date().toISOString(),
    issue: contract.source?.issue,
  });

  const canary = Boolean(plan.canaryFor);
  const existing = findPlanPr(contract.id, { run, canary });
  if (existing) {
    if (existing.author.login !== viewer.login) {
      throw new Error("Only the plan PR's publishing identity may amend it.");
    }
    const artifact = readPlanArtifact(existing.headRefOid, contract.id, { run });
    const files = githubPages(`repos/{owner}/{repo}/pulls/${existing.number}/files?per_page=100`, { run });
    const valid = validatePlanOnlyFiles({ taskId: contract.id, files, entry: artifact.entry });
    if (!valid.ok) throw new Error(valid.reason);
  }
  const committed = commitPlan(contract, plan, body, existing, deps);
  let result;
  if (existing) {
    run(["api", "--method", "PATCH", `repos/{owner}/{repo}/pulls/${existing.number}`, "-f", `body=${rendered}`]);
    result = { updated: true, number: existing.number, url: existing.url };
  } else {
    const url = run([
      "pr", "create", "--base", committed.base, "--head", committed.branch,
      "--title", `${contract.id}: plan`, "--body", rendered,
    ]).trim();
    const number = Number(/\/pull\/(\d+)$/.exec(url)?.[1]);
    if (!Number.isSafeInteger(number) || number < 1) throw new Error("GitHub did not return a plan PR URL.");
    result = { updated: false, number, url };
  }
  run([
    "api", "--method", "POST", `repos/{owner}/{repo}/pulls/${result.number}/requested_reviewers`,
    ...reviewers.flatMap((reviewer) => ["-f", `reviewers[]=${reviewer}`]),
  ]);
  return result;
}

/** Read the plan back from the task's pull request. */
export function fetchPlan(taskId, deps = {}) {
  const pr = findPlanPr(taskId, deps);
  return pr ? extractPlanSection(pr.body) : null;
}

export function fetchProposedPlan(contract, deps = {}) {
  const run = deps.run ?? gh;
  if (!contract.source?.trusted) throw new Error("Proposed plans require a trusted live task.");
  let number = deps.pullRequest;
  if (number === undefined || number === null) {
    const matches = JSON.parse(run([
      "pr", "list", "--head", deps.headBranch ?? implementationBranch(contract.id),
      "--state", "open", "--limit", "2", "--json", "number",
    ]));
    if (!Array.isArray(matches) || matches.length > 1) {
      throw new Error("The implementation branch does not identify one unambiguous PR.");
    }
    if (!matches.length) return null;
    number = matches[0].number;
  }
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error("An explicit valid implementation PR number is required.");
  }
  const pull = githubJson(`repos/{owner}/{repo}/pulls/${number}`, { run });
  if (pull.state !== "open" || pull.head?.ref?.startsWith("plan/")) {
    throw new Error("Combined execution requires an open implementation PR, not a plan-only PR.");
  }
  const repository = githubJson("repos/{owner}/{repo}", { run }).full_name;
  if (pull.head?.repo?.full_name !== repository || pull.base?.repo?.full_name !== repository) {
    throw new Error("The implementation PR must belong to the selected repository.");
  }
  const links = [...new Set([...String(pull.body ?? "").matchAll(/\b(?:closes|fixes|resolves)\s+#(\d+)\b/gi)]
    .map((match) => Number(match[1])))];
  if (links.length !== 1 || links[0] !== contract.source.issue) {
    throw new Error("The implementation PR must link exactly the selected task.");
  }
  const body = extractPlanSection(pull.body);
  const plan = extractPlanContract(body);
  const validation = validatePlanContract(plan, contract);
  if (!validation.ok || plan.baseSha !== pull.base.sha || plan.baseBranch !== pull.base.ref) {
    throw new Error("The implementation PR plan does not match the current task and base.");
  }
  if (Object.hasOwn(plan, "approval")) {
    throw new Error("A proposed plan must not contain an approval claim.");
  }
  if (approvalPolicyForRisk(plan.risk).requirePlanOnlyApproval) {
    throw new Error("This risk requires independent plan-first approval.");
  }
  if (deps.expectedHead && pull.head.sha !== deps.expectedHead) {
    throw new Error("The implementation PR head differs from the selected execution.");
  }
  if (deps.headBranch && pull.head.ref !== deps.headBranch) {
    throw new Error("The implementation PR branch differs from the selected workspace.");
  }
  const comparison = githubJson(`repos/{owner}/{repo}/compare/${plan.baseSha}...${pull.head.sha}`, { run });
  if (comparison.merge_base_commit?.sha !== plan.baseSha ||
      !["ahead", "identical"].includes(comparison.status)) {
    throw new Error("The implementation PR does not descend from its declared base.");
  }
  const after = githubJson(`repos/{owner}/{repo}/pulls/${pull.number}`, { run });
  if (after.state !== "open" || after.head.sha !== pull.head.sha ||
      after.base.sha !== pull.base.sha || after.body !== pull.body) {
    throw new Error("The implementation proposal changed during resolution.");
  }
  return {
    body, plan, approval: null,
    pr: { number: pull.number, url: pull.html_url, body: pull.body,
      author: { login: pull.user.login }, isDraft: pull.draft,
      headRefOid: pull.head.sha, baseRefOid: pull.base.sha },
  };
}

/** Read only a plan whose digest is bound to a human plan-only approval. */
export function fetchApprovedPlan(contract, deps = {}) {
  const run = deps.run ?? gh;
  if (!contract.source?.trusted) throw new Error("Approved plans require a trusted live task contract.");
  const planPrNumber = deps.planPrNumber;
  if (planPrNumber !== undefined &&
      (!Number.isSafeInteger(planPrNumber) || planPrNumber < 1)) {
    throw new Error("An explicit canary plan PR number must be a positive integer.");
  }
  const pr = planPrNumber === undefined
    ? findPlanPr(contract.id, { run })
    : planPrByNumber(planPrNumber, { run });
  if (!pr) return null;
  if (pr.isDraft !== false) return null;
  let body = extractPlanSection(pr.body);
  let plan = extractPlanContract(body);
  if (!body || !plan) throw new Error("The plan PR has no structured plan.");
  if (planPrNumber !== undefined &&
      (pr.state !== "open" || pr.number !== planPrNumber ||
        pr.headRefName !== planBranch(contract.id, true) ||
        pr.baseRefName !== plan.baseBranch || !plan.canaryFor)) {
    throw new Error("The explicit plan PR is not the current file-backed canary for this task.");
  }
  const validation = validatePlanContract(plan, contract);
  const files = githubPages(`repos/{owner}/{repo}/pulls/${pr.number}/files?per_page=100`, { run });
  const pinnedLegacy = planPrNumber === undefined && files.length === 0 &&
    isLegacyPlan(pr, plan, contract, deps.legacyPlans ?? GOVERNANCE_POLICY.planApproval?.legacyPlans);
  if (!validation.ok || (plan.baseSha !== pr.baseRefOid && !pinnedLegacy)) {
    throw new Error("The plan PR does not match the current task and approved base.");
  }
  const reviews = githubPages(`repos/{owner}/{repo}/pulls/${pr.number}/reviews?per_page=100`, { run });
  const repository = githubJson("repos/{owner}/{repo}", { run }).full_name;
  let result;
  if (files.length > 0) {
    const artifact = readPlanArtifact(pr.headRefOid, contract.id, { run });
    const committedPlan = extractPlanContract(artifact.body);
    if (!committedPlan || canonicalPlan(committedPlan) !== canonicalPlan(plan)) {
      throw new Error("The PR description does not match its immutable committed plan.");
    }
    plan = committedPlan;
    body = artifact.body.trim();
    if (pr.headRepoFullName !== repository || pr.baseRepoFullName !== repository) {
      throw new Error("The approved plan PR must remain in the current repository.");
    }
    result = evaluateNativePlanApproval({
      plan, contract, pr, reviews, files, entry: artifact.entry, repository,
      eligibleReviewers: configuredPlanReviewers(pr.author.login, { ...deps, run }),
    });
  } else {
    if (!pinnedLegacy) {
      throw new Error("Zero-file plan approval is restricted to the explicitly pinned legacy bootstrap.");
    }
    if (pr.headRepoFullName !== repository || pr.baseRepoFullName !== repository) {
      throw new Error("The pinned legacy plan PR must remain in the current repository.");
    }
    const records = githubPages(`repos/{owner}/{repo}/issues/${pr.number}/comments?per_page=100`, { run })
    .map(({ body: commentBody, user }) => {
      const record = parseApprovalRecord(commentBody);
      return record
        ? { ...record, commentAuthor: user?.login ?? null }
        : null;
    })
    .filter(Boolean);
    const comparison = githubJson(`repos/{owner}/{repo}/compare/${plan.baseSha}...${pr.headRefOid}`, { run });
    if (comparison.merge_base_commit?.sha !== plan.baseSha ||
        !["ahead", "identical"].includes(comparison.status) ||
        !Array.isArray(comparison.files) || comparison.files.length !== 0) {
      throw new Error("The pinned legacy plan no longer resolves to its exact fileless approved commit.");
    }
    result = evaluatePlanApproval({
      plan, contract, approvalRecords: records, reviews, prAuthor: pr.author.login,
      planHeadSha: pr.headRefOid, baseSha: plan.baseSha,
      planOnlyCommits: [pr.headRefOid],
    });
  }
  const current = planPrNumber === undefined
    ? findPlanPr(contract.id, { run })
    : planPrByNumber(planPrNumber, { run });
  if (!current || current.isDraft !== false || current.headRefOid !== pr.headRefOid ||
      current.baseRefOid !== pr.baseRefOid || current.body !== pr.body ||
      (planPrNumber !== undefined &&
        (current.state !== "open" || current.headRefName !== planBranch(contract.id, true) ||
          current.baseRefName !== plan.baseBranch))) {
    throw new Error("The plan PR changed while its approval was being resolved.");
  }
  return result.ok ? { body, plan, approval: result.record, pr } : null;
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const contract = loadTaskContract();
  if (!contract) {
    process.stderr.write(
      "No task contract is active. Run /plan <issue>, or npm run contract:fetch -- --issue <n>.\n",
    );
    process.exit(2);
  }

  if (process.argv.includes("--show")) {
    const plan = fetchPlan(contract.id);
    process.stdout.write(
      plan ? `${plan}\n` : `No plan PR is open for ${contract.id}.\n`,
    );
    process.exit(plan ? 0 : 1);
  }

  const transcript = valueOf("--transcript");
  const file = valueOf("--file");

  let body;
  if (file) {
    body = readFileSync(resolve(REPO_ROOT, file), "utf8");
  } else if (transcript) {
    try {
      body = extractPlan(readFileSync(transcript, "utf8"));
    } catch {
      body = null;
    }
  } else {
    body = await readStdin();
  }

  if (!body || !body.trim()) {
    process.stderr.write(
      "No plan content could be read. Publish it explicitly:\n" +
        "  node scripts/publish-plan.mjs --file <plan.md>\n",
    );
    process.exit(1);
  }

  const result = publish(contract, body, { base: valueOf("--base") });
  process.stdout.write(
    `${result.updated ? "updated" : "opened"} plan PR #${result.number} for ${contract.id}\n`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
