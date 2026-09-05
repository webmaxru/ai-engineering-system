/**
 * Build the machine-readable execution report used by the final evidence gate.
 *
 * Every producer emits a northstar/check-evidence/1 envelope bound to the
 * repository and head SHA. The fan-in rejects missing, failed, stale, or
 * cross-run evidence. Local validation can reach ready_for_review; only hosted
 * checks and human approvals can reach ready_for_acceptance.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CHECK_SCHEMA, digestPath } from "./evidence-record.mjs";
import {
  planDigest,
  validatePlanContract,
} from "./plan-contract.mjs";
import { loadTaskContract } from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const HOSTED_ONLY_CHECKS = new Set([
  "plan-approval",
  "codeql",
  "human-review",
  "production-environment",
  "repository-controls",
  "validation-authority",
]);

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

export function parseJUnit(xml, relativePath = "<memory>") {
  const sum = (attribute) =>
    [...xml.matchAll(new RegExp(`<testsuite\\b[^>]*\\b${attribute}="(\\d+)"`, "g"))]
      .reduce((total, match) => total + Number(match[1]), 0);

  const tests = sum("tests");
  const failures = sum("failures");
  const errors = sum("errors");
  const skipped = sum("skipped");
  const cases = [];
  const pattern =
    /<testcase\b([^>]*?)>([\s\S]*?)<\/testcase>|<testcase\b([^>]*?)\/>/g;
  for (const match of xml.matchAll(pattern)) {
    const attributes = match[1] ?? match[3] ?? "";
    const body = match[2] ?? "";
    const name = /\bname="([^"]*)"/.exec(attributes)?.[1];
    if (!name) continue;
    cases.push({
      name: decodeXml(name),
      skipped: /<skipped\b/.test(body),
      failed: /<(?:failure|error)\b/.test(body),
    });
  }
  const testNames = cases
    .filter(({ skipped, failed }) => !skipped && !failed)
    .map(({ name }) => name);

  return {
    present: true,
    path: relativePath,
    digest: digestPath(relativePath),
    tests,
    failures,
    errors,
    skipped,
    passed: failures + errors === 0,
    testNames,
    skippedTestNames: cases
      .filter(({ skipped }) => skipped)
      .map(({ name }) => name),
  };
}

export function readJUnit(relativePath) {
  const absolute = resolve(REPO_ROOT, relativePath);
  if (!existsSync(absolute)) {
    return { present: false, path: relativePath };
  }
  return {
    ...parseJUnit(readFileSync(absolute, "utf8"), relativePath),
    digest: digestPath(relativePath),
  };
}

export function criterionCoverage(criteria, testNames) {
  const leafNames = new Set(
    testNames.map((name) => name.split(" > ").at(-1)?.trim().toLowerCase()),
  );
  return criteria.map((criterion) => ({
    id: criterion.id,
    statement: criterion.statement,
    proven: leafNames.has(String(criterion.provenBy).trim().toLowerCase()),
    provenBy: criterion.provenBy,
  }));
}

export function loadCheckRecords(directory = "artifacts/checks") {
  const absolute = resolve(REPO_ROOT, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(resolve(absolute, name), "utf8")));
}

function readPlan(path = "artifacts/plan.json") {
  const absolute = resolve(REPO_ROOT, path);
  return existsSync(absolute)
    ? JSON.parse(readFileSync(absolute, "utf8"))
    : null;
}

function validateCheck(record, expected) {
  const reasons = [];
  if (record?.schema !== CHECK_SCHEMA) {
    reasons.push("invalid schema");
  }
  if (record?.provenance?.headSha !== expected.headSha) {
    reasons.push("head SHA mismatch");
  }
  if (
    expected.repository !== "local" &&
    record?.provenance?.repository !== expected.repository
  ) {
    reasons.push("repository mismatch");
  }
  if (expected.runId && record?.provenance?.runId !== expected.runId) {
    reasons.push("workflow run mismatch");
  }
  if (
    expected.pullRequest &&
    record?.provenance?.pullRequest !== expected.pullRequest
  ) {
    reasons.push("pull request mismatch");
  }
  if (expected.runId && !record?.provenance?.actor) {
    reasons.push("actor missing");
  }
  if (
    expected.runId &&
    ![
      "Governed Change",
      "Publish Evidence",
      "System Maintenance Approval",
    ].includes(
      record?.provenance?.workflow,
    )
  ) {
    reasons.push("workflow identity mismatch");
  }
  if (expected.runId && record?.provenance?.job !== record?.id) {
    reasons.push("job identity mismatch");
  }
  if (
    record?.artifact &&
    record.artifactDigest !== digestPath(record.artifact)
  ) {
    reasons.push("artifact digest mismatch");
  }
  return {
    valid: reasons.length === 0,
    reasons,
  };
}

export function buildExecutionReport({
  contract,
  plan,
  records,
  unit,
  acceptance,
  hosted,
  env = process.env,
}) {
  const expected = {
    repository: env.GITHUB_REPOSITORY ?? "local",
    runId: env.NORTHSTAR_RUN_ID ?? env.GITHUB_RUN_ID ?? null,
    headSha: env.NORTHSTAR_HEAD_SHA ?? env.GITHUB_SHA ?? gitHead(),
    pullRequest: env.PR_NUMBER ? Number(env.PR_NUMBER) : null,
  };
  const planValidation = plan
    ? validatePlanContract(plan, contract)
    : { ok: false, errors: ["machine-readable plan is missing"] };
  if (
    plan &&
    plan.planDigest &&
    plan.planDigest !== planDigest(plan)
  ) {
    planValidation.ok = false;
    planValidation.errors.push("stored planDigest does not match the canonical plan");
  }
  const requiredChecks = [
    ...new Set([
      ...(plan?.requiredChecks ?? []),
      ...(hosted ? ["validation-authority"] : []),
    ]),
  ]
    .filter((id) => id !== "evidence");
  const checks = requiredChecks.map((id) => {
    const candidates = records.filter((candidate) => candidate.id === id);
    const record = candidates.length === 1 ? candidates[0] : null;
    const validation = record
      ? validateCheck(record, expected)
      : {
          valid: false,
          reasons: [candidates.length > 1 ? "duplicate evidence" : "missing"],
        };
    return {
      id,
      hostedOnly: HOSTED_ONLY_CHECKS.has(id),
      present: Boolean(record),
      status: record?.status ?? "not-run",
      valid: validation.valid,
      reasons: validation.reasons,
      record: record ?? null,
    };
  });

  const successCriteria = criterionCoverage(contract.successCriteria, [
    ...(unit.testNames ?? []),
    ...(acceptance.testNames ?? []),
  ]);
  const unprovenCriteria = successCriteria
    .filter(({ proven }) => !proven)
    .map(({ id }) => id);

  const localChecks = checks.filter(({ hostedOnly }) => !hostedOnly);
  const hostedChecks = checks.filter(({ hostedOnly }) => hostedOnly);
  const failedLocalChecks = localChecks
    .filter(({ present, status, valid }) => !present || status !== "pass" || !valid)
    .map(({ id }) => id);
  const failedHostedChecks = hostedChecks
    .filter(({ present, status, valid }) => !present || status !== "pass" || !valid)
    .map(({ id }) => id);

  const localReady =
    Boolean(plan) &&
    planValidation.ok &&
    unit.present &&
    unit.passed &&
    acceptance.present &&
    acceptance.passed &&
    Number(acceptance.tests ?? 0) > 0 &&
    failedLocalChecks.length === 0 &&
    unprovenCriteria.length === 0;
  const hostedReady =
    localReady &&
    contract.source.trusted &&
    failedHostedChecks.length === 0;
  const decision = !localReady
    ? "review_required"
    : hosted && hostedReady
      ? "ready_for_acceptance"
      : "ready_for_review";

  return {
    schema: "northstar/execution-report/3",
    workItem: contract.id,
    contractSource: contract.source,
    generatedAt: new Date().toISOString(),
    validationLevel: hosted ? "hosted-integration" : "local-reference",
    provenance: expected,
    plan: plan
      ? {
          present: true,
          schema: plan.schema,
          risk: plan.risk,
          digest: plan.planDigest ?? null,
          contractDigest: plan.contractDigest,
          baseSha: plan.baseSha,
          valid: planValidation.ok,
          errors: planValidation.errors,
        }
      : { present: false, valid: false, errors: planValidation.errors },
    tests: { unit, acceptance },
    checks,
    successCriteria,
    failedLocalChecks,
    pendingHostedEvidence: failedHostedChecks,
    unprovenCriteria,
    decision,
    limits: [
      ...(!contract.source.trusted
        ? [
            "The task contract came from an offline fixture, not a live trusted GitHub issue.",
          ]
        : []),
      ...(!hosted
        ? [
            "Hosted PR reviews, workflow runs, rulesets, secret scanning, push protection, and environment approvals were not exercised locally.",
          ]
        : []),
    ],
  };
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const contract = loadTaskContract();
  if (!contract) {
    process.stderr.write(
      "No task contract resolved. Run npm run contract:fetch -- --issue <number>.\n",
    );
    process.exit(2);
  }

  const report = buildExecutionReport({
    contract,
    plan: readPlan(valueOf("--plan")),
    records: loadCheckRecords(valueOf("--checks")),
    unit: readJUnit("artifacts/unit-junit.xml"),
    acceptance: readJUnit("artifacts/acceptance-junit.xml"),
    hosted: process.argv.includes("--hosted") || process.env.GITHUB_ACTIONS === "true",
  });

  const out = valueOf("--out") ?? "artifacts/report.json";
  const target = resolve(REPO_ROOT, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write(
    [
      `task=${report.workItem}`,
      `level=${report.validationLevel}`,
      `decision=${report.decision}`,
      `unit=${report.tests.unit.present ? `${report.tests.unit.tests} tests, ${report.tests.unit.failures + report.tests.unit.errors} failed` : "absent"}`,
      `acceptance=${report.tests.acceptance.present ? `${report.tests.acceptance.tests} tests, ${report.tests.acceptance.failures + report.tests.acceptance.errors} failed` : "absent"}`,
      `criteriaProven=${report.successCriteria.filter(({ proven }) => proven).length}/${report.successCriteria.length}`,
    ].join("  ") + `\n${target}\n`,
  );

  if (report.decision === "review_required") {
    process.stdout.write(
      `failed local checks: ${report.failedLocalChecks.join(", ") || "none"}; ` +
        `unproven criteria: ${report.unprovenCriteria.join(", ") || "none"}\n`,
    );
    process.exitCode = 1;
  } else if (report.pendingHostedEvidence.length > 0) {
    process.stdout.write(
      `pending hosted evidence: ${report.pendingHostedEvidence.join(", ")}\n`,
    );
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
