/**
 * Post the evidence decision into the pull request, where it does not expire.
 *
 * Microsoft Learn is explicit that these are two different durability classes:
 *
 *   "GitHub is the system of record because it stores the artifacts through
 *    which development work is proposed and evaluated: repositories and
 *    branches, commits and pull requests, issues and discussions (context and
 *    intent), workflow runs and artifacts (evidence), review history."
 *
 *   "Workflow logs and artifacts are retained for 90 days by default and
 *    automatically deleted afterward."
 *
 * So the layer Learn labels "(evidence)" is the layer that expires, while
 * commits, pull requests and review history persist. An evidence bundle that
 * lives only in artifacts becomes an empty link after the retention window, and
 * "missing evidence = failure" would then be true of every audited change.
 *
 * This writes the decision and per-criterion coverage into the pull request
 * timeline - which persists - and links the artifacts for the detail while they
 * still exist. Learn's own guidance: "including links to workflow runs and
 * relevant artifacts in the PR under an 'Evidence' section".
 *
 * Usage: node scripts/publish-evidence.mjs --pr <number>
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { githubJson, githubPages, runGitHub } from "./github-api.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const MARKER = "<!-- northstar:evidence -->";

export function renderComment(report, links = {}) {
  const proven = report.successCriteria.filter((c) => c.proven).length;
  const total = report.successCriteria.length;
  const deferredCriteria = Array.isArray(report.deferredCriteria)
    ? report.deferredCriteria
    : [];
  const unverifiedDeferred = deferredCriteria.filter(({ status }) => status === "unverified");
  let verdict = "REVIEW REQUIRED";
  if (report.decision === "ready_for_acceptance") {
    verdict = "PASS";
  } else if (report.decision === "ready_for_review") {
    verdict = unverifiedDeferred.length > 0
      ? "STAGED REVIEW; POST-ACCEPTANCE EVIDENCE REQUIRED"
      : "LOCAL READY; HOSTED REVIEW REQUIRED";
  }

  const rows = report.successCriteria
    .map((c) => `| ${c.id} | ${c.statement} | ${c.proven ? "proven" : "**not proven**"} | \`${c.provenBy}\` |`)
    .join("\n");

  const evidenceRows = report.checks
    .map(
      (item) =>
        `| ${item.id} | ${item.record?.category ?? "unknown"} | ` +
        `${item.present && item.valid && item.status === "pass" ? "pass" : `**${item.status}**`} |`,
    )
    .join("\n");

  const source = report.contractSource?.url
    ? `[${report.contractSource.kind}](${report.contractSource.url})`
    : (report.contractSource?.kind ?? "unknown");

  return [
    MARKER,
    `## Evidence: ${verdict}`,
    "",
    `**${report.workItem}** graded against ${source}. ${proven}/${total} success criteria proven.`,
    `Validation level: **${report.validationLevel}**. Commit: \`${report.provenance?.headSha ?? "unknown"}\`.`,
    "",
    ...(deferredCriteria.length > 0
      ? [`Deferred criteria: ${deferredCriteria.map(({ id, status }) => `${id} (${status})`).join(", ")}`, ""]
      : []),
    "| Criterion | Statement | Result | Proven by |",
    "| --- | --- | --- | --- |",
    rows,
    "",
    "| Evidence | Category | Status |",
    "| --- | --- | --- |",
    evidenceRows,
    "",
    `Unit: ${report.tests.unit.tests ?? 0} tests, ${(report.tests.unit.failures ?? 0) + (report.tests.unit.errors ?? 0)} failed. ` +
      `Acceptance: ${report.tests.acceptance.tests ?? 0} tests, ${(report.tests.acceptance.failures ?? 0) + (report.tests.acceptance.errors ?? 0)} failed.`,
    "",
    ...(report.pendingHostedEvidence?.length
      ? [`Pending hosted evidence: ${report.pendingHostedEvidence.join(", ")}`, ""]
      : []),
    ...(report.limits?.length
      ? ["Limits:", ...report.limits.map((limit) => `- ${limit}`), ""]
      : []),
    ...(links.run ? [`Full logs and artifacts: [workflow run](${links.run})`, ""] : []),
    "> This comment is the durable record. Workflow logs and artifacts are " +
      "retained for 90 days by default and are deleted afterward, so the links " +
      "above will stop resolving before this summary does.",
    "",
    `_Generated ${report.generatedAt} from artifacts/report.json._`,
  ].join("\n");
}

function gh(args) {
  return runGitHub(args);
}

/** Replace our previous comment rather than adding one per run. */
export function existingCommentId(pr, publisher, { run = gh } = {}) {
  if (!/^[a-z0-9-]+\[bot\]$/i.test(publisher ?? "")) {
    throw new Error("Configure the trusted publisher App login before publishing evidence.");
  }
  const comments = githubPages(`repos/{owner}/{repo}/issues/${pr}/comments?per_page=100`, { run });
  const matches = comments.filter((comment) =>
    comment.user?.login === publisher && comment.user?.type === "Bot" &&
    comment.body?.startsWith(MARKER) &&
    Number.isSafeInteger(comment.id) && comment.id > 0
  );
  if (matches.length > 1) throw new Error("Multiple trusted evidence comments exist; reconcile them explicitly.");
  return matches[0]?.id ?? null;
}

function main() {
  const prIndex = process.argv.indexOf("--pr");
  const pr = prIndex === -1 ? process.env.PR_NUMBER : process.argv[prIndex + 1];
  if (!pr) {
    process.stderr.write("Pass --pr <number> or set PR_NUMBER.\n");
    process.exit(2);
  }

  const report = JSON.parse(readFileSync(resolve(REPO_ROOT, "artifacts/report.json"), "utf8"));
  const body = renderComment(report, {
    run:
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
  });

  const existing = existingCommentId(pr, process.env.NORTHSTAR_TRUSTED_PUBLISHER_APP_LOGIN);
  const pull = githubJson(`repos/{owner}/{repo}/pulls/${pr}`);
  if (pull.state !== "open" || pull.head.sha !== report.provenance?.headSha) {
    throw new Error("The evidence report does not match the current open implementation PR.");
  }
  if (existing) {
    gh(["api", "--method", "PATCH", `repos/{owner}/{repo}/issues/comments/${existing}`, "-f", `body=${body}`]);
    process.stdout.write(`updated evidence comment ${existing} on PR #${pr}\n`);
  } else {
    gh(["api", "--method", "POST", `repos/{owner}/{repo}/issues/${pr}/comments`, "-f", `body=${body}`]);
    process.stdout.write(`posted evidence comment on PR #${pr}\n`);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
