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
import { GOVERNANCE_POLICY } from "./risk-policy.mjs";
import { matchesPattern } from "./task-contract.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

const REQUIRED_FILES = [
  "AGENTS.md",
  ".gitattributes",
  ".github/CODEOWNERS",
  ".github/ISSUE_TEMPLATE/agent-task.yml",
  ".github/pull_request_template.md",
  ".github/hooks/agent-boundary.json",
  ".github/mcp.json",
  ".github/agents/plan.agent.md",
  ".github/agents/implement.agent.md",
  ".github/agents/risk-reviewer.agent.md",
  ".github/agents/dependency.agent.md",
  ".github/agents/security-reviewer.agent.md",
  ".github/workflows/governed-change.yml",
  ".github/workflows/plan-gate.yml",
  ".github/workflows/publish-evidence.yml",
  ".github/workflows/system-maintenance-approval.yml",
  ".github/workflows/governance-review.yml",
  ".github/workflows/production-gate.yml",
  ".github/workflows/daily-repository-status.md",
  ".github/workflows/daily-repository-status.lock.yml",
  "docs/architecture.md",
  "docs/RECOVERY-POLICY.md",
];

const STALE_DOC_PATHS = [
  "docs/SESSION-RUNBOOK.md",
  "docs/LOCAL-VSCODE-FLOW.md",
  "docs/demo-setup",
  "docs/fixtures",
];

function text(path) {
  return readFileSync(resolve(REPO_ROOT, path), "utf8");
}

function check(condition, id, detail) {
  return { id, ok: Boolean(condition), detail };
}

function refPatternMatches(pattern, defaultBranch) {
  const ref = `refs/heads/${defaultBranch}`;
  if (pattern === "~ALL" || pattern === "~DEFAULT_BRANCH") return true;
  if (pattern === defaultBranch || pattern === ref) return true;
  return matchesPattern(ref, pattern) || matchesPattern(defaultBranch, pattern);
}

export function rulesetAppliesToDefaultBranch(ruleset, defaultBranch) {
  if (ruleset.enforcement !== "active" || ruleset.target !== "branch") {
    return false;
  }
  const condition = ruleset.conditions?.ref_name;
  const included = condition?.include ?? [];
  const excluded = condition?.exclude ?? [];
  const includedByRule =
    included.length === 0 ||
    included.some((pattern) => refPatternMatches(pattern, defaultBranch));
  const excludedByRule = excluded.some((pattern) =>
    refPatternMatches(pattern, defaultBranch),
  );
  return includedByRule && !excludedByRule;
}

export function hasRulesetBypass(ruleset) {
  return (ruleset.bypass_actors ?? []).length > 0;
}

export function environmentReviewersMatch(rule, expected) {
  if (!rule || rule.prevent_self_review !== true) return false;
  const configured = (rule.reviewers ?? [])
    .map(({ type, reviewer }) => ({
      type,
      name: reviewer?.login ?? reviewer?.slug ?? reviewer?.name ?? "",
    }))
    .sort((left, right) =>
      `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`),
    );
  const required = [...expected].sort((left, right) =>
    `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`),
  );
  return (
    configured.length === required.length &&
    configured.every(
      (reviewer, index) =>
        reviewer.type === required[index]?.type &&
        reviewer.name === required[index]?.name,
    )
  );
}

export function strictStatusChecksEnabled(protection, rulesets) {
  return (
    protection.required_status_checks?.strict === true ||
    rulesets.some((ruleset) =>
      (ruleset.rules ?? []).some(
        ({ type, parameters }) =>
          type === "required_status_checks" &&
          parameters?.strict_required_status_checks_policy === true,
      ),
    )
  );
}

export function environmentAllowsOnlyDefaultBranch(
  environment,
  branchPolicies,
  defaultBranch,
) {
  return (
    environment.deployment_branch_policy?.protected_branches === false &&
    environment.deployment_branch_policy?.custom_branch_policies === true &&
    branchPolicies.length === 1 &&
    branchPolicies[0]?.type === "branch" &&
    branchPolicies[0]?.name === defaultBranch
  );
}

export function exactStringSet(actual, expected) {
  return (
    JSON.stringify([...actual].sort()) ===
    JSON.stringify([...expected].sort())
  );
}

export function strictRequiredContexts(protection, rulesets) {
  const contexts = new Set();
  if (protection.required_status_checks?.strict === true) {
    for (const context of protection.required_status_checks?.contexts ?? []) {
      contexts.add(context);
    }
    for (const { context } of protection.required_status_checks?.checks ?? []) {
      contexts.add(context);
    }
  }
  for (const ruleset of rulesets) {
    for (const { type, parameters } of ruleset.rules ?? []) {
      if (
        type !== "required_status_checks" ||
        parameters?.strict_required_status_checks_policy !== true
      ) {
        continue;
      }
      for (const { context } of parameters.required_status_checks ?? []) {
        contexts.add(context);
      }
    }
  }
  return contexts;
}

export function auditSourceTree() {
  const checks = [];
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter((file) => file && existsSync(resolve(REPO_ROOT, file)));
  for (const file of REQUIRED_FILES) {
    checks.push(check(existsSync(resolve(REPO_ROOT, file)), `required:${file}`, file));
  }
  for (const path of STALE_DOC_PATHS) {
    checks.push(
      check(
        !tracked.some(
          (trackedPath) =>
            trackedPath === path || trackedPath.startsWith(`${path}/`),
        ),
        `removed:${path}`,
        "Stale slide/demo documentation must not remain.",
      ),
    );

    if (existsSync(resolve(REPO_ROOT, ".github/mcp.json"))) {
      const mcp = JSON.parse(text(".github/mcp.json"));
      for (const [name, server] of Object.entries(mcp.mcpServers ?? {})) {
        checks.push(
          check(
            Array.isArray(server.tools) &&
              server.tools.length > 0 &&
              !server.tools.includes("*"),
            `mcp:${name}:named-tools`,
            "MCP servers must expose a non-empty named-tool allow list.",
          ),
        );
      }
    }
  }
  checks.push(
    check(
      !existsSync(resolve(REPO_ROOT, ".github/copilot/mcp-config.json")),
      "mcp:no-fake-repository-config",
      "Repository MCP settings live in GitHub settings; no fake endpoint is committed.",
    ),
  );

  if (existsSync(resolve(REPO_ROOT, ".github/hooks/agent-boundary.json"))) {
    const hook = JSON.parse(text(".github/hooks/agent-boundary.json"));
    const events = Object.keys(hook.hooks ?? {});
    for (const event of [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "SessionEnd",
    ]) {
      checks.push(
        check(events.includes(event), `hook:${event}`, "Required lifecycle event."),
      );
    }
    const lower = events.map((event) => event.toLowerCase());
    checks.push(
      check(
        new Set(lower).size === lower.length,
        "hook:no-case-duplicates",
        "Register one compatibility event name so hooks do not fire twice.",
      ),
    );
  }

  if (existsSync(resolve(REPO_ROOT, ".github/workflows/governed-change.yml"))) {
    const workflow = text(".github/workflows/governed-change.yml");
    checks.push(
      check(
        /group:\s*\$\{\{\s*github\.workflow\s*\}\}-/.test(workflow),
        "workflow:concurrency",
        "Concurrency is scoped by workflow and branch.",
      ),
    );
    for (const job of [
      "plan-contract:",
      "plan-approval:",
      "scope-policy:",
      "quality:",
      "acceptance:",
      "dependency-review:",
      "secret-scan:",
      "codeql:",
      "merge-validation:",
      "governance-policy:",
      "repository-controls:",
      "human-review:",
      "evidence:",
    ]) {
      checks.push(
        check(workflow.includes(job), `workflow:job:${job}`, "Required evidence job."),
      );
    }

    if (
      existsSync(
        resolve(REPO_ROOT, ".github/workflows/daily-repository-status.md"),
      )
    ) {
      const agentic = text(".github/workflows/daily-repository-status.md");
      for (const [id, pattern] of [
        ["strict", /\bstrict:\s*true\b/],
        ["budget", /\bmax-ai-credits:\s*\d+/],
        ["staged-safe-output", /\bstaged:\s*true\b/],
        ["read-only-contents", /\bcontents:\s*read\b/],
      ]) {
        checks.push(
          check(pattern.test(agentic), `agentic:${id}`, "Agentic Workflow guardrail."),
        );
      }
    }

    if (existsSync(resolve(REPO_ROOT, ".github/workflows/publish-evidence.yml"))) {
      const publisher = text(".github/workflows/publish-evidence.yml");
      const maintenance = text(
        ".github/workflows/system-maintenance-approval.yml",
      );
      checks.push(
        check(
          /workflow_run:/.test(publisher) &&
            /repository\.default_branch/.test(publisher) &&
            !/ref:\s*\$\{\{\s*github\.event\.workflow_run\.head_sha/.test(publisher),
          "workflow:trusted-publisher",
          "Write-capable evidence publication executes default-branch code.",
        ),
        check(
          /environment:\s*trusted-publisher/.test(publisher) &&
            /TRUSTED_PUBLISHER_APP_ID/.test(publisher) &&
            /TRUSTED_PUBLISHER_APP_PRIVATE_KEY/.test(publisher) &&
            /SYSTEM_MAINTENANCE_DISPATCH_APP_ID/.test(publisher) &&
            /SYSTEM_MAINTENANCE_DISPATCH_APP_PRIVATE_KEY/.test(publisher) &&
            /gh workflow run system-maintenance-approval\.yml/.test(publisher) &&
            /environment:\s*system-maintenance/.test(maintenance) &&
            /SYSTEM_MAINTENANCE_DISPATCH_APP_LOGIN/.test(maintenance) &&
            /TRUSTED_PUBLISHER_APP_PRIVATE_KEY/.test(maintenance) &&
            /northstar-system-maintenance-evidence/.test(maintenance) &&
            /--maintenance/.test(maintenance),
          "workflow:system-maintenance-gate",
          "Self-modifying changes are dispatched by a separate automation identity and use protected maintenance approval plus isolated evidence.",
        ),
        check(
          /context=trusted-acceptance/.test(
            text("scripts/publish-acceptance-status.mjs"),
          ) &&
            /actions\/create-github-app-token@/.test(publisher) &&
            /steps\.publisher-token\.outputs\.token/.test(publisher) &&
            /id:\s*publisher-token[\s\S]*?permission-actions:\s*read/.test(
              publisher,
            ) &&
            /id:\s*dispatcher-token[\s\S]*?permission-actions:\s*write/.test(
              publisher,
            ) &&
            /permission-administration:\s*read/.test(publisher) &&
            /permission-statuses:\s*write/.test(publisher),
          "workflow:trusted-acceptance-status",
          "Hosted acceptance is exposed as a dedicated GitHub App commit status.",
        ),
      );
    }

    if (existsSync(resolve(REPO_ROOT, ".github/workflows/production-gate.yml"))) {
      const production = text(".github/workflows/production-gate.yml");
      checks.push(
        check(
          /environment:\s*production/.test(production) &&
            /group:\s*production/.test(production) &&
            /cancel-in-progress:\s*false/.test(production),
          "workflow:production-boundary",
          "Production is environment-gated and non-overlapping.",
        ),
      );
    }
  }

  if (existsSync(resolve(REPO_ROOT, ".github/CODEOWNERS"))) {
    const owners = text(".github/CODEOWNERS");
    for (const path of ["/.github/", "/migrations/", "/src/services/"]) {
      checks.push(
        check(owners.includes(path), `codeowners:${path}`, "Sensitive path owner."),
      );
    }
  }

  const workflowsDir = resolve(REPO_ROOT, ".github/workflows");
  if (existsSync(workflowsDir)) {
    for (const name of readdirSync(workflowsDir).filter((file) =>
      file.endsWith(".yml"),
    )) {
      const workflow = text(`.github/workflows/${name}`);
      checks.push(
        check(
          !/uses:\s*[^@\s]+@(main|master)\b/.test(workflow),
          `workflow:pinned:${name}`,
          "Actions must not use mutable main or master refs.",
        ),
      );
    }
  }

  return {
    schema: "northstar/governance-report/1",
    generatedAt: new Date().toISOString(),
    policySchema: GOVERNANCE_POLICY.schema,
    reviewCadence: GOVERNANCE_POLICY.reviewCadence,
    ownership: GOVERNANCE_POLICY.ownership,
    checks,
    sourceControlsReady: checks.every(({ ok }) => ok),
    externalControls: Object.fromEntries(
      Object.keys(GOVERNANCE_POLICY.externalControls).map((name) => [
        name,
        "not-verified",
      ]),
    ),
  };
}

function onlineControls() {
  try {
    const api = (path) =>
      JSON.parse(
        execFileSync("gh", ["api", path], {
          cwd: REPO_ROOT,
          encoding: "utf8",
        }),
      );
    const apiPaginated = (path, key) => {
      const pages = JSON.parse(
        execFileSync(
          "gh",
          ["api", "--paginate", "--slurp", path],
          { cwd: REPO_ROOT, encoding: "utf8" },
        ),
      );
      return pages.flatMap((page) =>
        Array.isArray(page) ? page : (page?.[key] ?? []),
      );
    };
    const rulesetSummaries = apiPaginated(
      "repos/{owner}/{repo}/rulesets?per_page=100",
    );
    const rulesets = rulesetSummaries.map(({ id }) =>
      api(`repos/{owner}/{repo}/rulesets/${id}`),
    );
    const repository = api("repos/{owner}/{repo}");
    const defaultBranch = repository.default_branch;
    const protection = api(
      `repos/{owner}/{repo}/branches/${encodeURIComponent(defaultBranch)}/protection`,
    );
    const production = api("repos/{owner}/{repo}/environments/production");
    const maintenance = api(
      "repos/{owner}/{repo}/environments/system-maintenance",
    );
    const trustedPublisher = api(
      "repos/{owner}/{repo}/environments/trusted-publisher",
    );
    const environments = apiPaginated(
      "repos/{owner}/{repo}/environments?per_page=100",
      "environments",
    );
    const trustedPublisherBranches = apiPaginated(
      "repos/{owner}/{repo}/environments/trusted-publisher/deployment-branch-policies?per_page=100",
      "branch_policies",
    );
    const maintenanceBranches = apiPaginated(
      "repos/{owner}/{repo}/environments/system-maintenance/deployment-branch-policies?per_page=100",
      "branch_policies",
    );
    const publisherLogin = process.env.NORTHSTAR_TRUSTED_PUBLISHER_APP_LOGIN;
    const publisherId = process.env.NORTHSTAR_TRUSTED_PUBLISHER_APP_ID;
    const dispatcherLogin = process.env.NORTHSTAR_DISPATCH_APP_LOGIN;
    const dispatcherId = process.env.NORTHSTAR_DISPATCH_APP_ID;
    const appSlug = (login) => String(login ?? "").replace(/\[bot\]$/, "");
    const publisherApp = api(
      `apps/${encodeURIComponent(appSlug(publisherLogin))}`,
    );
    const dispatcherApp = api(
      `apps/${encodeURIComponent(appSlug(dispatcherLogin))}`,
    );
    const repositorySecrets = apiPaginated(
      "repos/{owner}/{repo}/actions/secrets?per_page=100",
      "secrets",
    );
    const organizationSecrets =
      repository.owner?.type === "Organization"
        ? apiPaginated(
            `orgs/${repository.owner.login}/actions/secrets?per_page=100`,
            "secrets",
          )
        : [];
    const environmentSecretNames = new Map(
      environments.map(({ name }) => [
        name,
        new Set(
          apiPaginated(
            `repos/{owner}/{repo}/environments/${encodeURIComponent(name)}/secrets?per_page=100`,
            "secrets",
          ).map(({ name: secretName }) => secretName),
        ),
      ]),
    );
    const reviewerRule = (environment) =>
      (environment.protection_rules ?? []).find(
        ({ type }) => type === "required_reviewers",
      );
    const productionRule = reviewerRule(production);
    const maintenanceRule = reviewerRule(maintenance);
    const maintenanceReviewerNames = (maintenanceRule?.reviewers ?? []).map(
      ({ reviewer }) =>
        reviewer?.login ?? reviewer?.slug ?? reviewer?.name ?? "",
    );
    const repositorySecretNames = new Set(
      repositorySecrets.map(({ name }) => name),
    );
    const organizationSecretNames = new Set(
      organizationSecrets.map(({ name }) => name),
    );
    const trustedPublisherSecretNames = new Set(
      environmentSecretNames.get("trusted-publisher") ?? [],
    );
    const maintenanceSecretNames = new Set(
      environmentSecretNames.get("system-maintenance") ?? [],
    );
    const secretLocations = (secretName) =>
      [...environmentSecretNames.entries()]
        .filter(([, secrets]) => secrets.has(secretName))
        .map(([name]) => name)
        .sort();
    const applicableRulesets = rulesets.filter((ruleset) =>
      rulesetAppliesToDefaultBranch(ruleset, defaultBranch),
    );
    const ruleTypes = new Set(
      applicableRulesets.flatMap((ruleset) =>
        (ruleset.rules ?? []).map(({ type }) => type),
      ),
    );
    const requiredContexts = new Set([
      ...(protection.required_status_checks?.contexts ?? []),
      ...(protection.required_status_checks?.checks ?? []).map(
        ({ context }) => context,
      ),
      ...applicableRulesets.flatMap((ruleset) =>
        (ruleset.rules ?? [])
          .filter(({ type }) => type === "required_status_checks")
          .flatMap(
            ({ parameters }) =>
              parameters?.required_status_checks?.map(
                ({ context }) => context,
              ) ?? [],
          ),
      ),
    ]);
    const requiredCheckSources = [
      ...(protection.required_status_checks?.checks ?? []).map(
        ({ context, app_id }) => ({ context, integrationId: app_id }),
      ),
      ...applicableRulesets.flatMap((ruleset) =>
        (ruleset.rules ?? [])
          .filter(({ type }) => type === "required_status_checks")
          .flatMap(
            ({ parameters }) =>
              parameters?.required_status_checks?.map(
                ({ context, integration_id }) => ({
                  context,
                  integrationId: integration_id,
                }),
              ) ?? [],
          ),
      ),
    ];
    const expectedContexts = GOVERNANCE_POLICY.requiredStatusChecks;
    const strictContexts = strictRequiredContexts(
      protection,
      applicableRulesets,
    );
    const checks = [
      check(
        applicableRulesets.length > 0,
        "hosted:ruleset",
        "An active branch ruleset targets the default branch.",
      ),
      check(
        ruleTypes.has("pull_request"),
        "hosted:pull-request-required",
        "The applicable ruleset requires pull requests.",
      ),
      check(
        ruleTypes.has("required_status_checks") ||
          Boolean(protection.required_status_checks),
        "hosted:status-check-rule",
        "The default branch requires status checks.",
      ),
      check(
        expectedContexts.every((context) => strictContexts.has(context)),
        "hosted:strict-status-checks",
        "Every required check must be covered by an up-to-date-with-base policy.",
      ),
      check(
        expectedContexts.every((context) => requiredContexts.has(context)),
        "hosted:required-check-names",
        "Every high-risk required check name is protected.",
      ),
      check(
        requiredCheckSources.some(
          ({ context, integrationId }) =>
            context === "trusted-acceptance" &&
            Number(integrationId) === Number(publisherId),
        ),
        "hosted:trusted-acceptance-source",
        "The trusted-acceptance context is bound to the dedicated GitHub App integration.",
      ),
      check(
        protection.required_pull_request_reviews?.require_code_owner_reviews === true,
        "hosted:code-owner-review",
        "Branch protection requires CODEOWNERS review.",
      ),
      check(
        protection.allow_force_pushes?.enabled === false ||
          ruleTypes.has("non_fast_forward"),
        "hosted:block-force-push",
        "Force pushes are blocked.",
      ),
      check(
        protection.allow_deletions?.enabled === false ||
          ruleTypes.has("deletion"),
        "hosted:block-deletion",
        "Branch deletion is blocked.",
      ),
      check(
        Boolean(protection.required_pull_request_reviews) ||
          ruleTypes.has("pull_request"),
        "hosted:restrict-direct-push",
        "Default-branch updates require the pull-request path.",
      ),
      check(
        protection.enforce_admins?.enabled === true,
        "hosted:enforce-admins",
        "Administrators cannot bypass default-branch protection.",
      ),
      check(
        [
          ...(protection.required_pull_request_reviews
            ?.bypass_pull_request_allowances?.users ?? []),
          ...(protection.required_pull_request_reviews
            ?.bypass_pull_request_allowances?.teams ?? []),
          ...(protection.required_pull_request_reviews
            ?.bypass_pull_request_allowances?.apps ?? []),
        ].length === 0,
        "hosted:no-pr-bypass",
        "No branch-protection actor can bypass the pull-request requirement.",
      ),
      check(
        applicableRulesets.every(
          (ruleset) => !hasRulesetBypass(ruleset),
        ),
        "hosted:no-always-bypass",
        "Applicable rulesets have no bypass actor or bypass mode.",
      ),
      check(
        repository.security_and_analysis?.secret_scanning?.status === "enabled",
        "hosted:secret-scanning",
        "GitHub secret scanning is enabled.",
      ),
      check(
        repository.security_and_analysis?.secret_scanning_push_protection?.status ===
          "enabled",
        "hosted:push-protection",
        "GitHub push protection is enabled.",
      ),
      check(
        Boolean(productionRule) &&
          environmentReviewersMatch(
            productionRule,
            GOVERNANCE_POLICY.environmentReviewers.production,
          ) &&
          production.can_admins_bypass === false,
        "hosted:production-reviewers",
        "The production environment has named reviewers, prevents self-review, and blocks administrator bypass.",
      ),
      check(
        Boolean(maintenanceRule) &&
          environmentReviewersMatch(
            maintenanceRule,
            GOVERNANCE_POLICY.environmentReviewers.systemMaintenance,
          ) &&
          environmentAllowsOnlyDefaultBranch(
            maintenance,
            maintenanceBranches,
            defaultBranch,
          ) &&
          maintenance.can_admins_bypass === false,
        "hosted:system-maintenance-reviewers",
        "The system-maintenance environment has named platform reviewers, prevents self-review, and blocks administrator bypass.",
      ),
      check(
        Number(publisherApp.id) === Number(publisherId) &&
          publisherLogin === `${publisherApp.slug}[bot]` &&
          !maintenanceReviewerNames.includes(publisherLogin),
        "hosted:trusted-publisher-identity",
        "The trusted status source is the configured GitHub App and is distinct from every maintenance reviewer.",
      ),
      check(
        Number(dispatcherApp.id) === Number(dispatcherId) &&
          dispatcherLogin === `${dispatcherApp.slug}[bot]` &&
          Number(dispatcherApp.id) !== Number(publisherApp.id) &&
          !maintenanceReviewerNames.includes(dispatcherLogin),
        "hosted:maintenance-dispatcher-identity",
        "A distinct GitHub App identity dispatches maintenance and is not an environment reviewer.",
      ),
      check(
        environmentAllowsOnlyDefaultBranch(
          trustedPublisher,
          trustedPublisherBranches,
          defaultBranch,
        ) &&
          trustedPublisher.can_admins_bypass === false,
        "hosted:trusted-publisher-environment",
        "The trusted-publisher environment allows only the exact default branch and blocks administrator bypass.",
      ),
      check(
        trustedPublisherSecretNames.has(
          GOVERNANCE_POLICY.trustedPublisherApp.privateKeySecret,
        ) &&
          maintenanceSecretNames.has(
            GOVERNANCE_POLICY.trustedPublisherApp.privateKeySecret,
          ) &&
          trustedPublisherSecretNames.has(
            GOVERNANCE_POLICY.systemMaintenanceDispatcherApp.privateKeySecret,
          ) &&
          !repositorySecretNames.has(
            GOVERNANCE_POLICY.trustedPublisherApp.privateKeySecret,
          ) &&
          !repositorySecretNames.has(
            GOVERNANCE_POLICY.systemMaintenanceDispatcherApp.privateKeySecret,
          ) &&
          !organizationSecretNames.has(
            GOVERNANCE_POLICY.trustedPublisherApp.privateKeySecret,
          ) &&
          !organizationSecretNames.has(
            GOVERNANCE_POLICY.systemMaintenanceDispatcherApp.privateKeySecret,
          ) &&
          exactStringSet(
            secretLocations(
              GOVERNANCE_POLICY.trustedPublisherApp.privateKeySecret,
            ),
            ["system-maintenance", "trusted-publisher"],
          ) &&
          exactStringSet(
            secretLocations(
              GOVERNANCE_POLICY.systemMaintenanceDispatcherApp.privateKeySecret,
            ),
            ["trusted-publisher"],
          ),
        "hosted:environment-scoped-app-keys",
        "Publisher and dispatcher App keys exist only in their exact protected-environment allowlists, not repository, organization, or other environment scopes.",
      ),
    ];
    return {
      available: true,
      rulesetCount: rulesets.length,
      checks,
      ready: checks.every(({ ok }) => ok),
      note: "Repository settings APIs were available and evaluated.",
    };
  } catch (error) {
    return {
      available: false,
      rulesetCount: 0,
      checks: [],
      ready: false,
      note:
        `${error.stderr ?? error.message}`.trim().split("\n")[0] ||
        "Repository settings API unavailable.",
    };
  }

}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const report = auditSourceTree();
  if (!process.argv.includes("--offline")) {
    report.online = onlineControls();
  }
  const target = resolve(
    REPO_ROOT,
    valueOf("--out") ?? "artifacts/governance-report.json",
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const ready = report.sourceControlsReady && report.online?.ready !== false;
  process.stdout.write(
    `governance=${ready ? "pass" : "fail"} checks=${report.checks.length}\n${target}\n`,
  );
  if (!ready) {
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
