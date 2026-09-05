import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  extractPlanContract,
  planDigest,
  validatePlanContract,
} from "./plan-contract.mjs";
import { loadTaskContract } from "./task-contract.mjs";

export const APPROVAL_MARKER = "<!-- northstar:plan-approval -->";
export const APPROVAL_SCHEMA = "northstar/plan-approval/1";

function timestamp(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function latestReviewsByUser(reviews) {
  const latest = new Map();
  for (const review of reviews ?? []) {
    const login = review.user?.login ?? review.author?.login;
    if (!login) continue;
    const previous = latest.get(login);
    if (
      !previous ||
      timestamp(review.submitted_at ?? review.submittedAt) >=
        timestamp(previous.submitted_at ?? previous.submittedAt)
    ) {
      latest.set(login, review);
    }
  }
  return [...latest.values()];
}

export function isHumanApproval(review, { prAuthor, headSha } = {}) {
  const login = review.user?.login ?? review.author?.login;
  const type = review.user?.type ?? review.author?.__typename;
  const state = String(review.state ?? "").toUpperCase();
  const reviewedCommit = review.commit_id ?? review.commit?.oid;
  return (
    state === "APPROVED" &&
    type === "User" &&
    Boolean(login) &&
    login !== prAuthor &&
    (!headSha || reviewedCommit === headSha)
  );
}

export function parseApprovalRecord(body) {
  const text = String(body ?? "");
  const marker = text.indexOf(APPROVAL_MARKER);
  if (marker === -1) return null;
  const fenced = /```json\s*([\s\S]*?)\s*```/i.exec(text.slice(marker));
  if (!fenced) return null;
  try {
    return JSON.parse(fenced[1]);
  } catch {
    return null;
  }
}

export function renderApprovalRecord(record) {
  return [
    APPROVAL_MARKER,
    "## Plan approval",
    "",
    "This durable record binds a human review to the canonical plan and plan-only commit.",
    "",
    "```json",
    JSON.stringify(record, null, 2),
    "```",
  ].join("\n");
}

export function evaluatePlanApproval({
  plan,
  contract,
  approvalRecords,
  reviews,
  prAuthor,
  planHeadSha,
  baseSha,
  planOnlyCommits = [],
}) {
  const digest = planDigest(plan);
  const latestReviews = latestReviewsByUser(reviews);

  for (const record of approvalRecords ?? []) {
    if (
      record?.schema !== APPROVAL_SCHEMA ||
      record.taskId !== contract.id ||
      record.contractDigest !== contract.source.bodyDigest ||
      record.planDigest !== digest ||
      record.commentAuthor !== record.reviewer ||
      plan.baseSha !== baseSha ||
      record.baseSha !== baseSha ||
      record.planOnly !== true ||
      record.reviewedCommit !== planHeadSha ||
      !planOnlyCommits.includes(record.reviewedCommit)
    ) {
      continue;
    }

    const review = latestReviews.find(
      (candidate) =>
        Number(candidate.id) === Number(record.reviewId) &&
        (candidate.user?.login ?? candidate.author?.login) === record.reviewer,
    );
    const state = String(review?.state ?? "").toUpperCase();
    const reviewedCommit = review?.commit_id ?? review?.commit?.oid;
    const type = review?.user?.type ?? review?.author?.__typename;
    if (
      review &&
      state === "APPROVED" &&
      type === "User" &&
      record.reviewer !== prAuthor &&
      reviewedCommit === record.reviewedCommit
    ) {
      return { ok: true, record, review };
    }
  }

  return {
    ok: false,
    reason:
      "No current human approval record matches the task contract, canonical plan, base SHA, and plan-only commit.",
  };
}

export function evaluateFinalApproval({ reviews, prAuthor, headSha, minimum = 1 }) {
  const approvals = latestReviewsByUser(reviews).filter((review) =>
    isHumanApproval(review, { prAuthor, headSha }),
  );
  return {
    ok: approvals.length >= minimum,
    approvals,
    reason:
      approvals.length >= minimum
        ? `${approvals.length} human approval(s) target the current head.`
        : `Expected ${minimum} human approval(s) targeting ${headSha}; found ${approvals.length}.`,
  };
}

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const pr = valueOf("--pr");
  const reviewId = valueOf("--review");
  if (!pr || !reviewId) {
    process.stderr.write("Pass --pr <number> --review <review-id>.\n");
    process.exit(2);
  }
  const contract = loadTaskContract();
  if (!contract) {
    process.stderr.write("No task contract is active.\n");
    process.exit(2);
  }

  const pull = JSON.parse(
    gh([
      "pr",
      "view",
      pr,
      "--json",
      "number,body,author,headRefOid,baseRefOid,files,url",
    ]),
  );
  const review = JSON.parse(
    gh(["api", `repos/{owner}/{repo}/pulls/${pr}/reviews/${reviewId}`]),
  );
  const plan = extractPlanContract(pull.body);
  const validation = validatePlanContract(plan, contract);
  if (!validation.ok) {
    process.stderr.write(`${validation.errors.join("\n")}\n`);
    process.exit(1);
  }
  if (pull.files.length !== 0) {
    process.stderr.write(
      "Plan approval can only be recorded while the pull request has no changed files.\n",
    );
    process.exit(1);
  }
  if (
    !isHumanApproval(review, {
      prAuthor: pull.author.login,
      headSha: pull.headRefOid,
    })
  ) {
    process.stderr.write(
      "The selected review is not a human APPROVED review of the current plan-only commit.\n",
    );
    process.exit(1);
  }
  const actor = JSON.parse(gh(["api", "user"])).login;
  if (actor !== review.user.login) {
    process.stderr.write(
      `The authenticated user (${actor}) must be the reviewer (${review.user.login}) who approved the plan.\n`,
    );
    process.exit(1);
  }

  const record = {
    schema: APPROVAL_SCHEMA,
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    planDigest: validation.planDigest,
    planPr: Number(pr),
    planUrl: pull.url,
    reviewId: Number(review.id),
    reviewer: review.user.login,
    reviewedCommit: review.commit_id,
    baseSha: pull.baseRefOid,
    approvedAt: review.submitted_at,
    planOnly: true,
  };
  const body = renderApprovalRecord(record);
  gh([
    "api",
    "--method",
    "POST",
    `repos/{owner}/{repo}/issues/${pr}/comments`,
    "-f",
    `body=${body}`,
  ]);
  process.stdout.write(
    `recorded plan approval for ${contract.id} at ${validation.planDigest}\n`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
