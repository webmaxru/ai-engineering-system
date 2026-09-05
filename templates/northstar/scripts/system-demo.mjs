import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  buildExecutionReport,
  readJUnit,
} from "./build-execution-report.mjs";
import {
  createCheckRecord,
  writeCheckRecord,
} from "./evidence-record.mjs";
import { checkMerge } from "./check-merge.mjs";
import {
  extractPlanContract,
  validatePlanContract,
} from "./plan-contract.mjs";
import { evaluateChangedPaths } from "./check-scope.mjs";
import {
  cacheContract,
  contractFromFile,
} from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function record(id, ok, artifact, category = "execution") {
  return writeCheckRecord(
    createCheckRecord({
      id,
      category,
      status: ok ? "pass" : "fail",
      artifact,
    }),
  );
}

function runNpm(args) {
  return run(npm, args);
}

function requireStep(id, result, artifact, category) {
  record(id, result.ok, artifact, category);
  if (!result.ok) {
    throw new Error(`${id} failed with exit code ${result.status}`);
  }
}

async function main() {
  const artifacts = resolve(REPO_ROOT, "artifacts");
  rmSync(resolve(artifacts, "checks"), { recursive: true, force: true });
  mkdirSync(resolve(artifacts, "checks"), { recursive: true });

  const contract = contractFromFile("tests/fixtures/WI-1842.issue.md");
  cacheContract(contract);

  const planMarkdown = readFileSync(
    resolve(REPO_ROOT, "tests/fixtures/WI-1842.plan.md"),
    "utf8",
  );
  const plan = extractPlanContract(planMarkdown);
  const planValidation = validatePlanContract(plan, contract);
  if (!planValidation.ok) {
    throw new Error(planValidation.errors.join(" "));
  }
  writeFileSync(
    resolve(artifacts, "plan.json"),
    `${JSON.stringify({ ...plan, planDigest: planValidation.planDigest }, null, 2)}\n`,
    "utf8",
  );
  record("plan-contract", true, "artifacts/plan.json", "policy");

  const scope = evaluateChangedPaths(
    [
      "src/services/postgres-idempotent-order-service.ts",
      "src/services/idempotency-harness.ts",
      "src/server.ts",
      "tests/acceptance/idempotency.acceptance.test.ts",
      "tests/acceptance/postgres-privacy.acceptance.test.ts",
    ],
    contract.inputs.scope,
    plan,
  );
  writeFileSync(
    resolve(artifacts, "scope-report.json"),
    `${JSON.stringify(
      {
        schema: "northstar/scope-report/1",
        taskId: contract.id,
        contractDigest: contract.source.bodyDigest,
        simulatedReferenceDiff: true,
        ...scope,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  record("scope-policy", scope.ok, "artifacts/scope-report.json", "policy");
  if (!scope.ok) throw new Error("reference scenario contains an out-of-scope path");

  requireStep(
    "quality",
    {
      ok: [
        runNpm(["run", "instructions:check"]),
        runNpm(["run", "lint"]),
        runNpm(["run", "typecheck"]),
        runNpm(["run", "build"]),
        runNpm(["run", "test:unit:ci"]),
      ].every(({ ok }) => ok),
      status: 1,
    },
    "artifacts/unit-junit.xml",
  );

  requireStep(
    "acceptance",
    runNpm(["run", "test:acceptance:ci"]),
    "artifacts/acceptance-junit.xml",
  );

  const audit = run(npm, ["audit", "--audit-level=high", "--json"], {
    capture: true,
  });
  writeFileSync(
    resolve(artifacts, "dependency-audit.json"),
    audit.stdout || audit.stderr || "{}",
    "utf8",
  );
  requireStep(
    "dependency-review",
    audit,
    "artifacts/dependency-audit.json",
    "security",
  );

  requireStep("secret-scan", runNpm(["run", "security:secrets"]), null, "security");
  requireStep(
    "governance-policy",
    runNpm(["run", "governance:check"]),
    "artifacts/governance-report.json",
    "policy",
  );

  const merge = checkMerge(plan.baseSha);
  writeFileSync(
    resolve(artifacts, "merge-report.json"),
    `${JSON.stringify(
      {
        schema: "northstar/merge-report/1",
        base: plan.baseSha,
        generatedAt: new Date().toISOString(),
        ...merge,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  record("merge-validation", merge.ok, "artifacts/merge-report.json", "policy");
  if (!merge.ok) throw new Error(merge.message);

  const report = buildExecutionReport({
    contract,
    plan: { ...plan, planDigest: planValidation.planDigest },
    records: [
      ...Object.values(
        Object.fromEntries(
          ["plan-contract", "scope-policy", "quality", "acceptance", "dependency-review", "secret-scan", "merge-validation", "governance-policy"]
            .map((id) => [
              id,
              JSON.parse(
                readFileSync(
                  resolve(artifacts, "checks", `${id}.json`),
                  "utf8",
                ),
              ),
            ]),
        ),
      ),
    ],
    unit: readJUnit("artifacts/unit-junit.xml"),
    acceptance: readJUnit("artifacts/acceptance-junit.xml"),
    hosted: false,
  });
  writeFileSync(
    resolve(artifacts, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(
    `\nAI engineering system demo: ${report.decision}\n` +
      `criteria: ${report.successCriteria.filter(({ proven }) => proven).length}/${report.successCriteria.length}\n` +
      `pending hosted evidence: ${report.pendingHostedEvidence.join(", ")}\n` +
      `report: ${resolve(artifacts, "report.json")}\n`,
  );
  if (report.decision !== "ready_for_review") {
    process.exitCode = 1;
  }
}

await main();
