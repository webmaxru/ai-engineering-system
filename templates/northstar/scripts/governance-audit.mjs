import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GOVERNANCE_POLICY } from "./risk-policy.mjs";
import { matchesPattern } from "./task-contract.mjs";
import { githubJson, githubPages, runGitHub } from "./github-api.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");
// CUSTOMIZE with the reviewed protected default branch, never a PR or event-head ref.
const REVIEWED_DEFAULT_BRANCH = "main";

const REQUIRED_FILES = [
  "AGENTS.md",
  ".gitattributes",
  ".github/CODEOWNERS",
  ".github/ISSUE_TEMPLATE/agent-task.yml",
  ".github/pull_request_template.md",
  ".github/hooks/agent-boundary.json",
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
  "docs/architecture.md",
  "docs/RECOVERY-POLICY.md",
];
const CAPABILITY_FILES = {
  mcp: [".github/mcp.json"],
  continuousAI: [
    ".github/workflows/daily-repository-status.md",
    ".github/workflows/daily-repository-status.lock.yml",
  ],
};

const STALE_DOC_PATHS = [
  "docs/SESSION-RUNBOOK.md",
  "docs/LOCAL-VSCODE-FLOW.md",
  "docs/demo-setup",
  "docs/fixtures",
];

function check(condition, id, detail) {
  return { id, ok: Boolean(condition), detail };
}

export function optionalCapabilities(policy = GOVERNANCE_POLICY) {
  // CUSTOMIZE optionalCapabilities.mcp and optionalCapabilities.continuousAI
  // in policy.json to match adoption. Omitted flags retain the enabled default.
  const configured = policy.optionalCapabilities;
  if (configured !== undefined && (!configured || typeof configured !== "object" || Array.isArray(configured))) {
    throw new Error("optionalCapabilities must be an object of explicit boolean capability flags.");
  }
  return Object.fromEntries(Object.keys(CAPABILITY_FILES).map((name) => {
    if (configured?.[name] !== undefined && typeof configured[name] !== "boolean") {
      throw new Error(`optionalCapabilities.${name} must be a boolean.`);
    }
    return [name, configured?.[name] ?? true];
  }));
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

function workflowStepBlock(workflow, id) {
  const text = String(workflow);
  const start = new RegExp(`^ {6}- id: ${id}[ \\t]*$`, "m").exec(text);
  if (!start) return null;
  const contentStart = start.index + start[0].length;
  const next = /(?:\r?\n) {6}- /.exec(text.slice(contentStart));
  const end = next ? contentStart + next.index : text.length;
  return text.slice(start.index, end);
}

export function trustedControlsUseReadOnlyToken(workflow) {
  const text = String(workflow);
  const tokenStep = workflowStepBlock(text, "controls-token");
  const auditStep = workflowStepBlock(text, "controls-audit");
  if (!tokenStep || !auditStep) return false;

  const permissions = (tokenStep.match(/^[ \t]+permission-[^:\r\n]+:[^\r\n]*$/gm) ?? [])
    .map((line) => line.trim());
  const requiredPermissions = [
    "permission-actions: read",
    "permission-administration: read",
    "permission-environments: read",
    "permission-organization-secrets: ${{ github.event.repository.owner.type == 'Organization' && 'read' || '' }}",
    "permission-secrets: read",
  ];
  const tokenReferences = text.match(/steps\.controls-token\.outputs\.token/g) ?? [];
  const governanceInvocations = text.match(/npm run governance:online/g) ?? [];

  return (
    /uses:\s*actions\/create-github-app-token@[0-9a-f]{40}/.test(tokenStep) &&
    /app-id:\s*\$\{\{\s*vars\.TRUSTED_PUBLISHER_APP_ID\s*\}\}/.test(tokenStep) &&
    /private-key:\s*\$\{\{\s*secrets\.TRUSTED_PUBLISHER_APP_PRIVATE_KEY\s*\}\}/.test(tokenStep) &&
    /continue-on-error:\s*true/.test(tokenStep) &&
    exactStringSet(permissions, requiredPermissions) &&
    tokenReferences.length === 1 &&
    governanceInvocations.length === 1 &&
    /if:\s*always\(\)/.test(auditStep) &&
    /continue-on-error:\s*true/.test(auditStep) &&
    /GH_TOKEN:\s*\$\{\{\s*steps\.controls-token\.outputs\.token\s*\}\}/.test(auditStep) &&
    /npm run governance:online/.test(auditStep) &&
    /--id repository-controls/.test(auditStep) &&
    /--status "\$\(\[ "\$CONTROLS_STATUS" -eq 0 \] && echo pass \|\| echo fail\)"/.test(auditStep)
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

export function governedAcceptanceDatabaseUrlIsSafe(workflow) {
  const databaseUrlLines =
    String(workflow).match(/^\s*DATABASE_URL:\s*.+$/gm) ?? [];
  if (databaseUrlLines.length !== 1) return false;

  const expected =
    "DATABASE_URL: \"${{ format('postgresql://{0}:{1}@localhost:5432/{2}', 'postgres', 'postgres', 'northstar') }}\"";
  return (
    databaseUrlLines[0].trim() === expected &&
    !/^\s*DATABASE_URL:\s*\*+/m.test(workflow)
  );
}

function workflowJobBlock(workflow, name) {
  const source = String(workflow);
  return new RegExp(
    `^ {2}${name}:\\r?\\n([\\s\\S]*?)(?=^ {2}[a-z][a-z-]*:|$(?![\\s\\S]))`,
    "m",
  ).exec(source)?.[1] ?? "";
}

export function governedArtifactsTargetExpectedDirectory(workflow) {
  const source = String(workflow);
  const downloadSteps =
    source.match(
      /^ {6}- uses: actions\/download-artifact@[^\r\n]+\r?\n(?: {8,}[^\r\n]*(?:\r?\n|$))*/gm,
    ) ?? [];
  const evidenceJob = workflowJobBlock(source, "evidence");
  const policyJobs = ["plan-approval", "scope-policy", "human-review"]
    .map((name) => workflowJobBlock(source, name));
  const planContract = workflowJobBlock(source, "plan-contract");
  const planContext = /name: northstar-plan-context\r?\n[\s\S]*?\r?\n {10}retention-days: 90/
    .exec(planContract)?.[0] ?? "";
  return (
    downloadSteps.length === 1 &&
    evidenceJob.includes("pattern: northstar-check-*") &&
    /^\s{10}path:\s*artifacts\s*$/m.test(downloadSteps[0]) &&
    /^\s{10}merge-multiple:\s*true\s*$/m.test(downloadSteps[0]) &&
    policyJobs.every((job) => job && !job.includes("actions/download-artifact@")) &&
    planContext.includes("artifacts/plan.json") &&
    !planContext.includes("artifacts/task-contract.json") &&
    !planContext.includes("artifacts/checks/plan-contract.json")
  );
}

export function governedSingleCheckArtifactsPreserveDirectory(workflow) {
  const text = String(workflow);
  return [
    ["northstar-check-plan-contract", "plan-contract"],
    ["northstar-check-plan-approval", "plan-approval"],
    ["northstar-check-scope", "scope-policy"],
    ["northstar-check-secret", "secret-scan"],
    ["northstar-check-review", "human-review"],
  ].every(([artifact, check]) =>
    new RegExp(
      `name: ${artifact}\\r?\\n\\s+path: artifacts/\\*\\*/${check}\\.json`,
    ).test(text),
  );
}

export function governedEvidenceTaskLookupPermissionsAreSafe(workflow) {
  const evidenceJob = /^ {2}evidence:\r?\n([\s\S]*)$/m.exec(
    String(workflow),
  )?.[1];
  const permissionBlock = evidenceJob
    ? /^ {4}permissions:\r?\n((?: {6}[^\r\n]+\r?\n)+)/m.exec(evidenceJob)?.[1]
    : null;
  if (!permissionBlock) return false;

  const permissions = permissionBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return exactStringSet(permissions, [
    "contents: read",
    "issues: read",
    "pull-requests: read",
  ]);
}

export function governedScopeUsesPullRequestContext(workflow) {
  const scopeJob = workflowJobBlock(workflow, "scope-policy");
  const scopeStep = /^ {6}- id: scope\r?\n([\s\S]*?)(?=^ {6}- |$(?![\s\S]))/m
    .exec(scopeJob)?.[1] ?? "";
  const permissionBlock = scopeJob
    ? /^ {4}permissions:\r?\n((?: {6}[^\r\n]+\r?\n)+)/m.exec(scopeJob)?.[1]
    : null;
  if (!scopeJob || !permissionBlock) return false;

  const permissions = permissionBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    exactStringSet(permissions, ["contents: read", "issues: read", "pull-requests: read"]) &&
    /env:\r?\n {10}GH_TOKEN: \$\{\{ github\.token \}\}/m.test(scopeStep) &&
    scopeJob.includes('npm run contract:from-pr -- --pr "$PR_NUMBER"') &&
    scopeJob.includes('npm run plan:gate -- --pr "$PR_NUMBER" --expected-head "$NORTHSTAR_HEAD_SHA"') &&
    scopeJob.includes("node scripts/select-execution-plan.mjs") &&
    /npm run scope:check --\s+--pr "\$PR_NUMBER"\s+--expected-head "\$NORTHSTAR_HEAD_SHA"/m.test(
      scopeJob,
    )
  );
}

export function governedRepositoryControlsHaveAppIdentity(workflow) {
  const controlsJob = workflowJobBlock(workflow, "repository-controls");
  return [
    "NORTHSTAR_TRUSTED_PUBLISHER_APP_ID: ${{ vars.TRUSTED_PUBLISHER_APP_ID }}",
    "NORTHSTAR_TRUSTED_PUBLISHER_APP_LOGIN: ${{ vars.TRUSTED_PUBLISHER_APP_LOGIN }}",
    "NORTHSTAR_DISPATCH_APP_ID: ${{ vars.SYSTEM_MAINTENANCE_DISPATCH_APP_ID }}",
    "NORTHSTAR_DISPATCH_APP_LOGIN: ${{ vars.SYSTEM_MAINTENANCE_DISPATCH_APP_LOGIN }}",
  ].every((setting) => controlsJob.includes(setting));
}

/** @param {{checks: Array<{id: string, ok: boolean, status?: string}>, lookups: Array<{id: string, state: string, detail?: string}>} | null | undefined} online */
export function summarizeOnlineFailures(online) {
  if (!online) return [];
  const checks = online.checks
    .filter(({ ok }) => !ok)
    .map(({ id, status }) => `${id}=${status ?? "fail"}`);
  const lookups = online.lookups
    .filter(({ state }) => state === "unavailable")
    .map(({ id, detail }) => {
      const status = /\(HTTP (\d{3})\)/i.exec(detail ?? "")?.[1];
      return `lookup:${id}=unavailable${status ? `-http-${status}` : ""}`;
    });
  return [...new Set([...checks, ...lookups])].sort();
}

export function governedMergedArtifactsHaveUniquePaths(workflow) {
  const text = String(workflow);
  const qualityJob = /^ {2}quality:\r?\n([\s\S]*?)(?=^ {2}acceptance:\r?$)/m.exec(
    text,
  )?.[1];
  const governanceJob =
    /^ {2}governance-policy:\r?\n([\s\S]*?)(?=^ {2}repository-controls:\r?$)/m.exec(
      text,
    )?.[1];
  return (
    Boolean(qualityJob) &&
    Boolean(governanceJob) &&
    qualityJob.includes(
      "npm run governance:check -- --out artifacts/quality-governance-report.json",
    ) &&
    qualityJob.includes("artifacts/quality-governance-report.json") &&
    !qualityJob.includes("artifacts/governance-report.json") &&
    governanceJob.includes("artifacts/governance-report.json") &&
    !governanceJob.includes("artifacts/quality-governance-report.json")
  );
}

export function publisherUsesTrustedDefaultBranch(workflow, defaultBranch = REVIEWED_DEFAULT_BRANCH) {
  const source = String(workflow);
  if (!/^ {2}workflow_run:[ \t]*(?:#[^\r\n]*)?$/m.test(source)) return false;
  const checkouts = source.match(
    /^ {6}- uses: actions\/checkout@[^\s#]+[ \t]*(?:#[^\r\n]*)?\r?\n(?: {8,}[^\r\n]*(?:\r?\n|$))*/gm,
  ) ?? [];
  const uses = source.match(/^\s*(?:-\s+)?uses:\s*["']?actions\/checkout@/gm) ?? [];
  // Unfamiliar layouts must not inherit a trusted ref from another step or a comment.
  if (checkouts.length === 0 || checkouts.length !== uses.length) return false;
  return checkouts.every((step) => {
    const values = (key) => [...step.matchAll(new RegExp(
      `^ {10}${key}:[ \\t]*(?:"([^"]*)"|'([^']*)'|([^#\\r\\n]*?))[ \\t]*(?:#[^\\r\\n]*)?$`, "gm",
    ))].map((match) => (match[1] ?? match[2] ?? match[3]).trim());
    const refs = values("ref");
    const repositories = values("repository");
    return /^ {8}with:[ \t]*$/m.test(step) &&
      refs.length === 1 &&
      (refs[0] === defaultBranch || refs[0] === `refs/heads/${defaultBranch}` ||
        /^\$\{\{\s*github\.event\.repository\.default_branch\s*\}\}$/.test(refs[0])) &&
      (repositories.length === 0 || (repositories.length === 1 &&
        /^\$\{\{\s*github\.repository\s*\}\}$/.test(repositories[0])));
  });
}

export function auditSourceTree({ root = REPO_ROOT, policy = GOVERNANCE_POLICY, trackedFiles, read = (path) => readFileSync(path, "utf8") } = {}) {
  const checks = [];
  const contents = new Map();
  const text = (path) => {
    if (!contents.has(path)) {
      try {
        const absolute = resolve(root, path);
        if (!lstatSync(absolute).isFile()) throw new Error("Not a regular file.");
        contents.set(path, read(absolute));
      } catch (error) {
        checks.push(check(false, `read:${path}`, `Source control file is unreadable (${error.code ?? error.name}).`));
        contents.set(path, "");
      }
    }
    return contents.get(path);
  };
  const json = (path) => {
    try {
      const data = JSON.parse(text(path));
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected an object.");
      return data;
    } catch {
      checks.push(check(false, `json:${path}`, "Source control file must contain a valid JSON object."));
      return null;
    }
  };
  const capabilities = optionalCapabilities(policy);
  const tracked = trackedFiles ?? execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const [name, files] of Object.entries(CAPABILITY_FILES)) {
    if (!capabilities[name]) {
      checks.push(check(
        files.every((file) => !existsSync(resolve(root, file))),
        `capability:${name}:disabled`,
        "Explicitly disabled optional capability; its active configuration must be absent.",
      ));
    }
  }
  const required = [...REQUIRED_FILES, ...Object.entries(CAPABILITY_FILES)
    .filter(([name]) => capabilities[name]).flatMap(([, files]) => files)];
  for (const file of required) {
    checks.push(check(existsSync(resolve(root, file)), `required:${file}`, file));
    if (existsSync(resolve(root, file))) text(file);
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
  }
  if (existsSync(resolve(root, ".github/mcp.json"))) {
    const mcp = json(".github/mcp.json");
    const servers = mcp?.mcpServers;
    checks.push(check(
      servers && typeof servers === "object" && !Array.isArray(servers),
      "mcp:server-map", "MCP configuration must declare a server map.",
    ));
    if (servers && typeof servers === "object" && !Array.isArray(servers)) {
      for (const [name, server] of Object.entries(servers)) {
        checks.push(
          check(
            Array.isArray(server?.tools) &&
              server.tools.length > 0 &&
              server.tools.every((tool) => typeof tool === "string" && tool.trim() && !tool.includes("*")),
            `mcp:${name}:named-tools`,
            "MCP servers must expose a non-empty named-tool allow list.",
          ),
        );
      }
    }
  }
  checks.push(
    check(
      !existsSync(resolve(root, ".github/copilot/mcp-config.json")),
      "mcp:no-fake-repository-config",
      "Repository MCP settings live in GitHub settings; no fake endpoint is committed.",
    ),
  );

  if (existsSync(resolve(root, ".github/hooks/agent-boundary.json"))) {
    const hook = json(".github/hooks/agent-boundary.json");
    const events = Object.keys(hook?.hooks ?? {});
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

  if (existsSync(resolve(root, ".github/workflows/governed-change.yml"))) {
    const workflow = text(".github/workflows/governed-change.yml");
    checks.push(
      check(
        /group:\s*\$\{\{\s*github\.workflow\s*\}\}-/.test(workflow),
        "workflow:concurrency",
        "Concurrency is scoped by workflow and branch.",
      ),
      check(
        governedAcceptanceDatabaseUrlIsSafe(workflow),
        "workflow:acceptance-database-url",
        "Acceptance uses the declared ephemeral PostgreSQL service without a YAML alias scalar.",
      ),
      check(
        governedArtifactsTargetExpectedDirectory(workflow),
        "workflow:artifact-handoff",
        "Policy jobs resolve live task authority; evidence fan-in downloads check artifacts only.",
      ),
      check(
        governedSingleCheckArtifactsPreserveDirectory(workflow),
        "workflow:single-check-artifact-layout",
        "Single-file check artifacts preserve their checks directory during upload.",
      ),
      check(
        governedEvidenceTaskLookupPermissionsAreSafe(workflow),
        "workflow:evidence-task-lookup",
        "The evidence job has only the read permissions needed to resolve the pull request and linked issue.",
      ),
      check(
        governedRepositoryControlsHaveAppIdentity(workflow),
        "workflow:repository-controls-app-identity",
        "Online repository-control checks receive the configured publisher and dispatcher identities.",
      ),
      check(
        !/TRUSTED_PUBLISHER_APP_PRIVATE_KEY|SYSTEM_MAINTENANCE_DISPATCH_APP_PRIVATE_KEY/.test(workflow),
        "workflow:pull-request-no-app-private-keys",
        "Pull-request jobs never receive protected App private keys.",
      ),
      check(
        governedScopeUsesPullRequestContext(workflow),
        "workflow:scope-pull-request-context",
        "Hosted scope validation uses immutable pull-request metadata instead of a detached checkout branch.",
      ),
      check(
        governedMergedArtifactsHaveUniquePaths(workflow),
        "workflow:merged-artifact-paths",
        "Independently generated reports use unique paths before artifact fan-in.",
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
        resolve(root, ".github/workflows/daily-repository-status.md"),
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

    if (existsSync(resolve(root, ".github/workflows/publish-evidence.yml"))) {
      const publisher = text(".github/workflows/publish-evidence.yml");
      const maintenance = text(
        ".github/workflows/system-maintenance-approval.yml",
      );
      checks.push(
        check(
          publisherUsesTrustedDefaultBranch(publisher),
          "workflow:trusted-publisher",
          "Publisher checkouts use only the reviewed default-branch source; hosted branch protection is verified separately.",
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
        check(
          trustedControlsUseReadOnlyToken(publisher),
          "workflow:publisher-controls-read-token",
          "Trusted Publisher repository-control queries use a separate read-only App token.",
        ),
      );
    }

    if (existsSync(resolve(root, ".github/workflows/production-gate.yml"))) {
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

  if (existsSync(resolve(root, ".github/CODEOWNERS"))) {
    const owners = text(".github/CODEOWNERS");
    for (const path of ["/.github/", "/migrations/", "/src/services/"]) {
      checks.push(
        check(owners.includes(path), `codeowners:${path}`, "Sensitive path owner."),
      );
    }
  }

  if (existsSync(resolve(root, ".github/workflows/governance-review.yml"))) {
    const workflow = text(".github/workflows/governance-review.yml");
    checks.push(check(
      /GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/.test(workflow),
      "workflow:governance-authentication",
      "Scheduled governance uses the built-in read token; unavailable administrator APIs are reported, not assumed enabled.",
    ));
  }

  const workflowsDir = resolve(root, ".github/workflows");
  if (existsSync(workflowsDir)) {
    for (const name of readdirSync(workflowsDir).filter((file) =>
      /\.ya?ml$/i.test(file),
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
    policySchema: policy.schema,
    reviewCadence: policy.reviewCadence,
    ownership: policy.ownership,
    optionalCapabilities: capabilities,
    checks,
    sourceControlsReady: checks.every(({ ok }) => ok),
    externalControls: Object.fromEntries(
      Object.keys(policy.externalControls).map((name) => [
        name,
        "not-verified",
      ]),
    ),
  };
}

export function onlineControls({ env = process.env, run = runGitHub, policy = GOVERNANCE_POLICY } = {}) {
  const lookups = [];
  const checks = [];
  const authentication = env.GH_TOKEN ? "GH_TOKEN" :
    env.GITHUB_COPILOT_GIT_TOKEN ? "GITHUB_COPILOT_GIT_TOKEN" : null;
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const named = (value) => isObject(value) && typeof value.name === "string" && value.name.trim().length > 0;
  const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
  const optionalArray = (value, predicate) => value === undefined || (Array.isArray(value) && value.every(predicate));
  const statusCheck = (value) => isObject(value) && nonempty(value.context);
  const rulesetSchema = (data, id) => isObject(data) && data.id === id &&
    ["active", "disabled", "evaluate"].includes(data.enforcement) &&
    ["branch", "tag", "push"].includes(data.target) && Array.isArray(data.bypass_actors) &&
    (data.conditions === undefined || (isObject(data.conditions) &&
      (data.conditions.ref_name === undefined || (isObject(data.conditions.ref_name) &&
        optionalArray(data.conditions.ref_name.include, nonempty) &&
        optionalArray(data.conditions.ref_name.exclude, nonempty))))) &&
    Array.isArray(data.rules) && data.rules.every((rule) => isObject(rule) && nonempty(rule.type) &&
      (rule.type !== "required_status_checks" || (isObject(rule.parameters) &&
        typeof rule.parameters.strict_required_status_checks_policy === "boolean" &&
        Array.isArray(rule.parameters.required_status_checks) && rule.parameters.required_status_checks.every(statusCheck))) &&
      (rule.type !== "pull_request" || isObject(rule.parameters)));
  const protectionSchema = (data) => {
    if (!isObject(data)) return false;
    const status = data.required_status_checks;
    const reviews = data.required_pull_request_reviews;
    const allowances = reviews?.bypass_pull_request_allowances;
    return (status == null || (isObject(status) && optionalArray(status.contexts, nonempty) && optionalArray(status.checks, statusCheck))) &&
      (reviews == null || isObject(reviews)) &&
      (allowances === undefined || (isObject(allowances) &&
        ["users", "teams", "apps"].every((key) => optionalArray(allowances[key], isObject))));
  };
  const environmentSchema = (data, name) => named(data) && data.name === name &&
    Array.isArray(data.protection_rules) && data.protection_rules.every((rule) =>
      isObject(rule) && nonempty(rule.type) && (rule.type !== "required_reviewers" ||
        (Array.isArray(rule.reviewers) && rule.reviewers.every((review) =>
          isObject(review) && ["User", "Team"].includes(review.type) &&
          isObject(review.reviewer) &&
          [review.reviewer.login, review.reviewer.slug, review.reviewer.name].some(nonempty)))));
  const uniqueNames = (data) => data.every(named) && new Set(data.map(({ name }) => name)).size === data.length;
  const unavailable = (id, detail) => {
    const result = { id, state: "unavailable", detail, data: null };
    lookups.push(result);
    return result;
  };
  const lookup = (id, route, { array, key, validate = isObject, absentProtection = false } = {}) => {
    if (!authentication) return unavailable(id, "Explicit GitHub authentication is missing; provide the built-in workflow token as GH_TOKEN.");
    try {
      let data;
      if (array) data = githubPages(route, { run });
      else if (key) {
        const pages = JSON.parse(run(["api", "--paginate", "--slurp", route]));
        if (!Array.isArray(pages) || pages.length === 0 ||
          !pages.every((page) => isObject(page) && Array.isArray(page[key]))) {
          throw new Error("Invalid paginated response.");
        }
        data = pages.flatMap((page) => page[key]);
        if (pages[0].total_count !== undefined && pages[0].total_count !== data.length) {
          throw new Error("Incomplete paginated response.");
        }
      } else data = githubJson(route, { run });
      if (!validate(data)) throw new Error("Invalid response schema.");
      const result = { id, state: "available", detail: "GitHub response was read and validated.", data };
      lookups.push(result);
      return result;
    } catch (error) {
      const diagnostic = `${error.stderr ?? ""}\n${error.message ?? ""}`;
      const status = /\bHTTP (\d{3})\b/i.exec(diagnostic)?.[1];
      if (absentProtection && status === "404" && /Branch not protected/i.test(diagnostic)) {
        const result = { id, state: "absent", detail: "GitHub explicitly reports no legacy branch protection.", data: null };
        lookups.push(result);
        return result;
      }
      return unavailable(id, `Authenticated GitHub lookup failed${status ? ` (HTTP ${status})` : " or returned invalid data"}. ` +
        "Existing results are retained. Administrator/App access may be required; unavailable is not disabled.");
    }
  };
  const control = (id, condition, dependencies, detail) => {
    const unknown = dependencies.filter(({ state }) => state === "unavailable");
    const status = condition ? "pass" : unknown.length > 0 ? "unavailable" : "fail";
    checks.push({
      id, ok: status === "pass", status,
      detail: unknown.length > 0 && !condition
        ? `${detail} Unverified input(s): ${unknown.map(({ id }) => id).join(", ")}.`
        : detail,
    });
  };
  const repository = lookup("repository", "repos/{owner}/{repo}", {
    validate: (data) => isObject(data) && typeof data.default_branch === "string" && data.default_branch &&
      ["User", "Organization"].includes(data.owner?.type) && typeof data.owner.login === "string",
  });
  const defaultBranch = repository.data?.default_branch;
  const summaries = lookup("rulesets", "repos/{owner}/{repo}/rulesets?per_page=100", {
    array: true, validate: (data) => Array.isArray(data) &&
      data.every((item) => Number.isSafeInteger(item?.id) && item.id > 0) &&
      new Set(data.map(({ id }) => id)).size === data.length,
  });
  const ruleLookups = (summaries.data ?? []).map(({ id }) =>
    lookup(`ruleset:${id}`, `repos/{owner}/{repo}/rulesets/${id}`, {
      validate: (data) => rulesetSchema(data, id),
    }));
  const rulesets = ruleLookups.filter(({ state }) => state === "available").map(({ data }) => data);
  const protection = defaultBranch ? lookup("legacy-protection",
    `repos/{owner}/{repo}/branches/${encodeURIComponent(defaultBranch)}/protection`, { absentProtection: true, validate: protectionSchema })
    : unavailable("legacy-protection", "The default branch could not be resolved.");
  const environments = lookup("environments", "repos/{owner}/{repo}/environments?per_page=100", {
    key: "environments", validate: uniqueNames,
  });
  const environment = (name) => lookup(`environment:${name}`, `repos/{owner}/{repo}/environments/${name}`, {
    validate: (data) => environmentSchema(data, name),
  });
  const production = environment("production");
  const maintenance = environment("system-maintenance");
  const publisher = environment("trusted-publisher");
  const branches = (name) => lookup(`branches:${name}`,
    `repos/{owner}/{repo}/environments/${name}/deployment-branch-policies?per_page=100`, {
      key: "branch_policies", validate: (data) => data.every((branch) => named(branch) && ["branch", "tag"].includes(branch.type)),
    });
  const maintenanceBranches = branches("system-maintenance");
  const publisherBranches = branches("trusted-publisher");
  const app = (id, login, number) => typeof login === "string" && /^[a-z0-9-]+\[bot\]$/i.test(login) &&
    /^[1-9]\d*$/.test(number ?? "") && Number.isSafeInteger(Number(number))
    ? lookup(id, `apps/${encodeURIComponent(login.replace(/\[bot\]$/, ""))}`, {
        validate: (data) => isObject(data) && Number.isSafeInteger(data.id) && typeof data.slug === "string",
      })
    : unavailable(id, "The independently approved App login and ID are not configured; no identity was guessed.");
  const publisherLogin = env.NORTHSTAR_TRUSTED_PUBLISHER_APP_LOGIN;
  const dispatcherLogin = env.NORTHSTAR_DISPATCH_APP_LOGIN;
  const publisherId = env.NORTHSTAR_TRUSTED_PUBLISHER_APP_ID;
  const dispatcherId = env.NORTHSTAR_DISPATCH_APP_ID;
  const publisherApp = app("publisher-app", publisherLogin, publisherId);
  const dispatcherApp = app("dispatcher-app", dispatcherLogin, dispatcherId);
  const secrets = (id, route) => lookup(id, route, { key: "secrets", validate: uniqueNames });
  const repoSecrets = secrets("repository-secrets", "repos/{owner}/{repo}/actions/secrets?per_page=100");
  const orgSecrets = repository.data?.owner.type === "Organization"
    ? secrets("organization-secrets", `orgs/${encodeURIComponent(repository.data.owner.login)}/actions/secrets?per_page=100`)
    : repository.state === "available" ? { state: "available", data: [] }
      : unavailable("organization-secrets", "Repository ownership could not be verified.");
  const secretNames = new Set(["production", "system-maintenance", "trusted-publisher",
    ...(environments.data ?? []).map(({ name }) => name)]);
  const environmentSecrets = new Map([...secretNames].map((name) => [
    name, secrets(`secrets:${name}`, `repos/{owner}/{repo}/environments/${encodeURIComponent(name)}/secrets?per_page=100`),
  ]));
  const applicable = defaultBranch ? rulesets.filter((ruleset) => rulesetAppliesToDefaultBranch(ruleset, defaultBranch)) : [];
  const noBypassRulesets = applicable.filter((ruleset) => !hasRulesetBypass(ruleset));
  const allowances = protection.data?.required_pull_request_reviews?.bypass_pull_request_allowances;
  const legacyNoBypass = ["users", "teams", "apps"].every((key) =>
    allowances?.[key] === undefined || (Array.isArray(allowances[key]) && allowances[key].length === 0));
  const legacyEnforced = protection.state === "available" &&
    protection.data.enforce_admins?.enabled === true && legacyNoBypass;
  const legacy = legacyEnforced ? protection.data : {};
  const types = new Set(noBypassRulesets.flatMap(({ rules }) => rules.map(({ type }) => type)));
  const prRules = noBypassRulesets.flatMap(({ rules }) => rules.filter(({ type }) => type === "pull_request"));
  const branchDependencies = [repository, summaries, ...ruleLookups, protection];
  const branchCheck = (id, condition, detail) => control(id, condition, branchDependencies, detail);
  const requiredContexts = new Set([
    ...(legacy.required_status_checks?.contexts ?? []),
    ...(legacy.required_status_checks?.checks ?? []).map(({ context }) => context),
    ...noBypassRulesets.flatMap(({ rules }) => rules.filter(({ type }) => type === "required_status_checks")
      .flatMap(({ parameters }) => parameters?.required_status_checks?.map(({ context }) => context) ?? [])),
  ]);
  const strictContexts = strictRequiredContexts(legacy, noBypassRulesets);
  const expectedContexts = policy.requiredStatusChecks;
  const requiredSources = [
    ...(legacy.required_status_checks?.checks ?? []).map(({ context, app_id }) => ({ context, id: app_id })),
    ...noBypassRulesets.flatMap(({ rules }) => rules.filter(({ type }) => type === "required_status_checks")
      .flatMap(({ parameters }) => parameters?.required_status_checks?.map(({ context, integration_id }) => ({ context, id: integration_id })) ?? [])),
  ];
  const pullRequestsRequired = Boolean(legacy.required_pull_request_reviews) || prRules.length > 0;
  branchCheck("hosted:branch-controls", legacyEnforced || noBypassRulesets.length > 0,
    "An enforced ruleset or legacy branch protection covers the default branch without actor or administrator bypass.");
  branchCheck("hosted:pull-request-required", pullRequestsRequired, "A verified branch-control mechanism requires pull requests.");
  branchCheck("hosted:status-check-rule", Boolean(legacy.required_status_checks) || types.has("required_status_checks"), "The default branch requires status checks.");
  branchCheck("hosted:strict-status-checks", expectedContexts.every((context) => strictContexts.has(context)), "Every required check is protected by an up-to-date-with-base policy.");
  branchCheck("hosted:required-check-names", expectedContexts.every((context) => requiredContexts.has(context)), "Every required check name is protected.");
  control("hosted:trusted-acceptance-source", Number(publisherId) > 0 &&
    requiredSources.some(({ context, id }) => context === "trusted-acceptance" && Number(id) === Number(publisherId)),
  [...branchDependencies, publisherApp], "The trusted-acceptance context is bound to the configured GitHub App integration.");
  branchCheck("hosted:code-owner-review", legacy.required_pull_request_reviews?.require_code_owner_reviews === true ||
    prRules.some(({ parameters }) => parameters?.require_code_owner_review === true), "A verified branch-control mechanism requires CODEOWNERS review.");
  branchCheck("hosted:block-force-push", legacy.allow_force_pushes?.enabled === false || types.has("non_fast_forward"), "Force pushes are blocked.");
  branchCheck("hosted:block-deletion", legacy.allow_deletions?.enabled === false || types.has("deletion"), "Branch deletion is blocked.");
  branchCheck("hosted:restrict-direct-push", pullRequestsRequired, "Default-branch updates require the pull-request path.");
  branchCheck("hosted:enforce-admins", legacyEnforced || noBypassRulesets.length > 0, "Administrators cannot bypass the enforcing branch-control mechanism.");
  branchCheck("hosted:no-pr-bypass", (legacyEnforced && Boolean(legacy.required_pull_request_reviews)) || prRules.length > 0, "The enforcing pull-request requirement has no bypass actors.");
  branchCheck("hosted:no-always-bypass", legacyEnforced || (noBypassRulesets.length > 0 &&
    summaries.state === "available" && ruleLookups.every(({ state }) => state === "available") &&
    applicable.every((ruleset) => !hasRulesetBypass(ruleset))), "A complete no-bypass branch-control mechanism was verified.");
  for (const [id, feature] of [
    ["hosted:secret-scanning", "secret_scanning"],
    ["hosted:push-protection", "secret_scanning_push_protection"],
  ]) {
    const value = repository.data?.security_and_analysis?.[feature]?.status;
    const settings = ["enabled", "disabled"].includes(value) ? repository
      : unavailable(feature, "Security settings were not visible in the repository response; administrator access may be required.");
    control(id, value === "enabled", [settings], `GitHub ${feature.replaceAll("_", " ")} must be enabled.`);
  }
  const reviewerRule = (resource) => resource.data?.protection_rules.find(({ type }) => type === "required_reviewers");
  const maintenanceRule = reviewerRule(maintenance);
  const reviewerNames = (maintenanceRule?.reviewers ?? []).map(({ reviewer }) => reviewer?.login ?? reviewer?.slug ?? reviewer?.name);
  control("hosted:production-reviewers",
    environmentReviewersMatch(reviewerRule(production), policy.environmentReviewers.production) &&
      production.data?.can_admins_bypass === false,
    [production], "Production requires the exact reviewer allow list, prevents self-review, and blocks administrator bypass.");
  control("hosted:system-maintenance-reviewers",
    environmentReviewersMatch(maintenanceRule, policy.environmentReviewers.systemMaintenance) &&
      environmentAllowsOnlyDefaultBranch(maintenance.data ?? {}, maintenanceBranches.data ?? [], defaultBranch) &&
      maintenance.data?.can_admins_bypass === false,
    [maintenance, maintenanceBranches, repository], "Maintenance requires the exact independent reviewers, default branch, and no administrator bypass.");
  control("hosted:trusted-publisher-identity",
    Number(publisherApp.data?.id) === Number(publisherId) && publisherLogin === `${publisherApp.data?.slug}[bot]` &&
      maintenance.state === "available" && !reviewerNames.includes(publisherLogin),
    [publisherApp, maintenance], "The configured publisher App is distinct from the maintenance reviewers.");
  control("hosted:maintenance-dispatcher-identity",
    Number(dispatcherApp.data?.id) === Number(dispatcherId) && dispatcherLogin === `${dispatcherApp.data?.slug}[bot]` &&
      publisherApp.state === "available" && Number(dispatcherId) !== Number(publisherId) &&
      maintenance.state === "available" && !reviewerNames.includes(dispatcherLogin),
    [dispatcherApp, publisherApp, maintenance], "The configured dispatcher is a distinct App and is not a maintenance reviewer.");
  control("hosted:trusted-publisher-environment",
    environmentAllowsOnlyDefaultBranch(publisher.data ?? {}, publisherBranches.data ?? [], defaultBranch) &&
      publisher.data?.can_admins_bypass === false,
    [publisher, publisherBranches, repository], "Trusted publication is restricted to the exact default branch without administrator bypass.");
  const hasSecret = (resource, secret) => resource?.data?.some(({ name }) => name === secret) === true;
  const locations = (secret) => [...environmentSecrets].filter(([, resource]) => hasSecret(resource, secret)).map(([name]) => name);
  const publisherKey = policy.trustedPublisherApp.privateKeySecret;
  const dispatcherKey = policy.systemMaintenanceDispatcherApp.privateKeySecret;
  const inventories = [repository, environments, repoSecrets, orgSecrets, ...environmentSecrets.values()];
  control("hosted:environment-scoped-app-keys",
    inventories.every(({ state }) => state === "available") &&
      !hasSecret(repoSecrets, publisherKey) && !hasSecret(repoSecrets, dispatcherKey) &&
      !hasSecret(orgSecrets, publisherKey) && !hasSecret(orgSecrets, dispatcherKey) &&
      exactStringSet(locations(publisherKey), ["system-maintenance", "trusted-publisher"]) &&
      exactStringSet(locations(dispatcherKey), ["trusted-publisher"]),
    inventories, "App keys must exist only in their exact protected environments, not repository, organization, or other scopes.");
  const available = checks.every(({ status }) => status !== "unavailable");
  return {
    available, authentication, rulesetCount: rulesets.length, checks,
    lookups: lookups.map(({ id, state, detail }) => ({ id, state, detail })),
    ready: checks.every(({ ok }) => ok),
    note: available
      ? "Required controls were evaluated; an unused alternative API may still be unavailable."
      : "Some controls remain unverified. Successful checks are retained; separate administrator/App access may be required.",
  };
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  const target = resolve(REPO_ROOT, valueOf("--out") ?? "artifacts/governance-report.json");
  rmSync(target, { force: true });
  const report = auditSourceTree();
  if (!process.argv.includes("--offline")) {
    report.online = onlineControls();
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const ready = report.sourceControlsReady && report.online?.ready !== false;
  process.stdout.write(
    `governance=${ready ? "pass" : "fail"} checks=${report.checks.length}\n${target}\n`,
  );
  if (!ready) {
    const sourceFailures = report.checks.filter(({ ok }) => !ok).map(({ id }) => id);
    const onlineFailures = summarizeOnlineFailures(report.online);
    process.stdout.write(
      `failed source checks: ${sourceFailures.join(", ") || "none"}; ` +
      `failed online controls: ${onlineFailures.join(", ") || "none"}\n`,
    );
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Governance audit failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
