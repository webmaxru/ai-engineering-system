import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isPathAllowed,
  loadTaskContract,
  splitProhibitions,
} from "./task-contract.mjs";
import { inferRisk, riskRank } from "./risk-policy.mjs";
import { validateCloudExecution } from "./execution-context.mjs";
import { canonicalPlan, extractPlanContract, validatePlanContract } from "./plan-contract.mjs";
import { readPlanArtifact, validatePlanOnlyFiles } from "./plan-artifact.mjs";
import { planBranch } from "./publish-plan.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const SHA = /^[0-9a-f]{40}$/;

function normalize(path) {
  return String(path).replace(/\\/g, "/").replace(/^\.\//, "");
}

export function evaluateChangedPaths(paths, scope, plan = null) {
  const unique = [...new Set(paths.map(normalize).filter(Boolean))];
  const prohibited = splitProhibitions(scope);
  const taskViolations = unique.filter((path) => !isPathAllowed(path, scope));
  const planViolations = plan
    ? unique.filter((path) => !isPathAllowed(path, plan.scope))
    : [];
  const assessment = inferRisk({
    paths: unique,
    operations: plan?.operations ?? [],
  });
  const riskViolation =
    plan && riskRank(assessment.risk) > riskRank(plan.risk)
      ? {
          declaredRisk: plan.risk,
          effectiveRisk: assessment.risk,
        }
      : null;
  const violations = [...new Set([...taskViolations, ...planViolations])];

  return {
    ok: violations.length === 0 && !riskViolation,
    paths: unique,
    violations,
    taskViolations,
    planViolations,
    declaredRisk: plan?.risk ?? null,
    effectiveRisk: assessment.risk,
    riskViolation,
    advisoryProhibitions: prohibited.advisory,
  };
}

export function parseNameStatus(raw) {
  const paths = [];
  for (const line of String(raw ?? "").split(/\r?\n/).filter(Boolean)) {
    const [status, first, second] = line.split("\t");
    if (!status || !first) continue;
    paths.push(first);
    if ((status.startsWith("R") || status.startsWith("C")) && second) {
      paths.push(second);
    }
  }
  return paths;
}

export function isPlanOnlyBranch(taskId, headBranch, plan) {
  return headBranch === planBranch(taskId, Boolean(plan?.canaryFor));
}

export function evaluateExecutionContext({
  taskId,
  plan,
  headBranch,
  baseBranch,
  baseSha,
  descendsFromApprovedBase,
  cloudAuthorized = false,
}) {
  const expectedHeadBranch =
    `agent/implement/${String(taskId).toLowerCase()}`;
  const violations = [
    ...(headBranch === expectedHeadBranch || cloudAuthorized
      ? []
      : [`head branch ${headBranch || "<detached>"} is not ${expectedHeadBranch}`]),
    ...(baseBranch === plan.baseBranch
      ? []
      : [`base branch ${baseBranch} is not ${plan.baseBranch}`]),
    ...(baseSha === plan.baseSha
      ? []
      : [`base SHA ${baseSha} is not approved base ${plan.baseSha}`]),
    ...(descendsFromApprovedBase
      ? []
      : [`HEAD does not descend from approved base ${plan.baseSha}`]),
  ];
  return { ok: violations.length === 0, expectedHeadBranch, violations };
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function git(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gh(args) {
  return execFileSync("gh", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main() {
  const contract = loadTaskContract();
  if (!contract) {
    process.stderr.write(
      "No task contract is active. Scope cannot be evaluated without authority.\n",
    );
    process.exit(2);
  }
  let plan;
  try {
    plan = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "artifacts/plan.json"), "utf8"),
    );
  } catch {
    process.stderr.write(
      "No machine-readable approved plan is available at artifacts/plan.json.\n",
    );
    process.exit(2);
  }
  const pr = valueOf("--pr");
  let baseSha;
  let headSha;
  let paths;
  let baseBranch;
  let headBranch;
  let descendsFromApprovedBase = true;
  let cloudAuthorized = false;
  let planOnly = false;
  if (pr) {
    const expectedHead = valueOf("--expected-head");
    const pull = JSON.parse(
      gh([
        "pr",
        "view",
        pr,
        "--json",
        "baseRefName,baseRefOid,changedFiles,headRefName,headRefOid",
      ]),
    );
    if (expectedHead && pull.headRefOid !== expectedHead) {
      throw new Error(
        `Pull request head ${pull.headRefOid} does not match expected workflow SHA ${expectedHead}.`,
      );
    }
    const pages = JSON.parse(
      gh([
        "api",
        "--paginate",
        "--slurp",
        `repos/{owner}/{repo}/pulls/${pr}/files`,
      ]),
    );
    const files = pages.flat();
    if (files.length !== pull.changedFiles) {
      throw new Error(
        `Pull request file list is incomplete: API returned ${files.length} of ${pull.changedFiles} changed files.`,
      );
    }
    baseSha = pull.baseRefOid;
    headSha = pull.headRefOid;
    baseBranch = pull.baseRefName;
    headBranch = pull.headRefName;
    const comparison = JSON.parse(
      gh([
        "api",
        `repos/{owner}/{repo}/compare/${plan.baseSha}...${headSha}`,
      ]),
    );
    descendsFromApprovedBase =
      comparison.merge_base_commit?.sha === plan.baseSha &&
      ["ahead", "identical"].includes(comparison.status);
    const cloudPull = JSON.parse(gh(["api", `repos/{owner}/{repo}/pulls/${pr}`]));
    const repository = JSON.parse(gh(["api", "repos/{owner}/{repo}"])).full_name;
    const mergedPull = cloudPull.state === "closed" && cloudPull.merged === true &&
      typeof cloudPull.merged_at === "string" && SHA.test(cloudPull.merge_commit_sha ?? "");
    const allowMerged = process.argv.includes("--allow-merged");
    if (cloudPull.state !== "open" && !(allowMerged && mergedPull)) {
      throw new Error("Scope validation requires an open PR or an explicitly allowed merged source PR.");
    }
    if (cloudPull.head?.repo?.full_name !== repository ||
        cloudPull.base?.repo?.full_name !== repository ||
        cloudPull.base?.ref !== plan.baseBranch) {
      throw new Error("Scope validation requires the exact same-repository task and base branch.");
    }
    cloudAuthorized = validateCloudExecution({
      pull: cloudPull, repository, contract, plan, branch: headBranch, headSha,
      descendsFromApprovedBase,
    });
    if (cloudPull.head.sha !== headSha || cloudPull.base.sha !== baseSha) {
      throw new Error("Pull request identity changed during scope evaluation.");
    }
    if (mergedPull && allowMerged) baseSha = plan.baseSha;
    if (isPlanOnlyBranch(contract.id, headBranch, plan)) {
      const artifact = readPlanArtifact(headSha, contract.id, { run: gh });
      const committed = extractPlanContract(artifact.body);
      const validation = validatePlanContract(committed, contract);
      const shape = validatePlanOnlyFiles({ taskId: contract.id, files, entry: artifact.entry });
      planOnly = validation.ok && shape.ok && baseSha === plan.baseSha &&
        committed && canonicalPlan(committed) === canonicalPlan(plan) && descendsFromApprovedBase;
      if (!planOnly) throw new Error("The plan-only PR does not contain exactly its validated task plan artifact.");
    }
    paths = files.flatMap((file) =>
      [file.previous_filename, file.filename].filter(Boolean),
    );
    const current = JSON.parse(gh(["api", `repos/{owner}/{repo}/pulls/${pr}`]));
    const currentIsMerged = current.state === "closed" && current.merged === true &&
      typeof current.merged_at === "string" &&
      current.merge_commit_sha === cloudPull.merge_commit_sha;
    if ((current.state !== "open" && !(allowMerged && currentIsMerged)) ||
        current.head?.sha !== cloudPull.head?.sha ||
        current.base?.sha !== cloudPull.base?.sha ||
        current.base?.ref !== cloudPull.base?.ref ||
        current.body !== cloudPull.body ||
        (expectedHead && current.head?.sha !== expectedHead)) {
      throw new Error(
        `Pull request identity changed during scope evaluation: expected ${expectedHead}, found ${current.head?.sha}.`,
      );
    }
  } else {
    const base = valueOf("--base") ?? process.env.GITHUB_BASE_REF;
    if (!base) {
      process.stderr.write("Pass --base <branch-or-sha> or --pr <number>.\n");
      process.exit(2);
    }
    const baseRef = /^[0-9a-f]{40}$/i.test(base) || base.includes("/")
      ? base
      : `origin/${base}`;
    baseSha = git(["rev-parse", baseRef]).trim();
    headSha = git(["rev-parse", "HEAD"]).trim();
    baseBranch = base === plan.baseSha ? plan.baseBranch : base.replace(/^origin\//, "");
    headBranch = git(["branch", "--show-current"]).trim();
    try {
      git(["merge-base", "--is-ancestor", plan.baseSha, "HEAD"]);
    } catch {
      descendsFromApprovedBase = false;
    }
    const raw = git(["diff", "--name-status", "-M", `${baseSha}`]);
    paths = [...parseNameStatus(raw), ...git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean)];
  }
  const result = evaluateChangedPaths(
    paths,
    planOnly ? { allowed: [`docs/plans/${contract.id.toLowerCase()}.md`], prohibited: [] } : contract.inputs.scope,
    planOnly ? null : plan,
  );
  const isolation = evaluateExecutionContext({
    taskId: contract.id,
    plan,
    headBranch,
    baseBranch,
    baseSha,
    descendsFromApprovedBase,
    cloudAuthorized: cloudAuthorized || planOnly,
  });
  const isolationViolations = isolation.violations;
  result.ok = result.ok && isolationViolations.length === 0;
  const report = {
    schema: "northstar/scope-report/1",
    taskId: contract.id,
    contractDigest: contract.source.bodyDigest,
    baseSha,
    headSha,
    baseBranch,
    headBranch,
    expectedHeadBranch: isolation.expectedHeadBranch,
    isolationViolations,
    generatedAt: new Date().toISOString(),
    planOnly,
    ...result,
  };
  const out = valueOf("--out") ?? "artifacts/scope-report.json";
  const target = resolve(REPO_ROOT, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write(
    `scope=${result.ok ? "pass" : "fail"} changed=${result.paths.length} violations=${result.violations.length}\n${target}\n`,
  );
  if (!result.ok) {
    process.stderr.write(
      [
        result.violations.length > 0
          ? `Outside task or plan scope: ${result.violations.join(", ")}`
          : "",
        result.riskViolation
          ? `Declared risk ${result.riskViolation.declaredRisk} is below effective risk ${result.riskViolation.effectiveRisk}.`
          : "",
        ...isolationViolations,
      ]
        .filter(Boolean)
        .join("\n") + "\n",
    );
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
