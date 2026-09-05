import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { approvalPolicyForRisk } from "./risk-policy.mjs";
import { evaluateFinalApproval } from "./plan-approval.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

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

const pr = valueOf("--pr");
if (!pr) {
  process.stderr.write("Pass --pr <number>.\n");
  process.exit(2);
}

const plan = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "artifacts/plan.json"), "utf8"),
);
const pull = JSON.parse(
  gh(["pr", "view", pr, "--json", "author,headRefOid,reviewDecision"]),
);
const expectedHead = valueOf("--expected-head");
if (expectedHead && pull.headRefOid !== expectedHead) {
  process.stderr.write(
    `Pull request head ${pull.headRefOid} does not match expected workflow SHA ${expectedHead}.\n`,
  );
  process.exit(1);
}
const reviews = JSON.parse(
  gh(["api", `repos/{owner}/{repo}/pulls/${pr}/reviews`]),
);
const policy = approvalPolicyForRisk(plan.risk);
const result = evaluateFinalApproval({
  reviews,
  prAuthor: pull.author.login,
  headSha: pull.headRefOid,
  minimum: policy.minimumApprovals,
});
const codeOwnerSatisfied =
  !policy.requireCodeOwnerReview || pull.reviewDecision === "APPROVED";
const ok = result.ok && codeOwnerSatisfied;
const reason = !result.ok
  ? result.reason
  : codeOwnerSatisfied
    ? result.reason
    : "GitHub reviewDecision is not APPROVED; required review or CODEOWNERS policy is unsatisfied.";
const after = JSON.parse(
  gh(["pr", "view", pr, "--json", "headRefOid"]),
);
if (expectedHead && after.headRefOid !== expectedHead) {
  process.stderr.write(
    `Pull request head changed during review evaluation: expected ${expectedHead}, found ${after.headRefOid}.\n`,
  );
  process.exit(1);
}

process.stdout.write(`${ok ? "pass" : "fail"}: ${reason}\n`);
process.exit(ok ? 0 : 1);
