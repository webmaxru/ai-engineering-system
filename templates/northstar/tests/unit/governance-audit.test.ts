import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditSourceTree,
  environmentAllowsOnlyDefaultBranch,
  environmentReviewersMatch,
  exactStringSet,
  governedAcceptanceDatabaseUrlIsSafe,
  governedArtifactsTargetExpectedDirectory,
  governedEvidenceTaskLookupPermissionsAreSafe,
  governedMergedArtifactsHaveUniquePaths,
  governedRepositoryControlsHaveAppIdentity,
  governedScopeUsesPullRequestContext,
  governedSingleCheckArtifactsPreserveDirectory,
  hasRulesetBypass,
  onlineControls,
  optionalCapabilities,
  publisherUsesTrustedDefaultBranch,
  rulesetAppliesToDefaultBranch,
  summarizeOnlineFailures,
  strictRequiredContexts,
  strictStatusChecksEnabled,
  trustedControlsUseReadOnlyToken,
} from "../../scripts/governance-audit.mjs";
import { GOVERNANCE_POLICY } from "../../scripts/risk-policy.mjs";

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function sourceFixture() {
  const root = mkdtempSync(join(tmpdir(), "northstar-governance-"));
  temporary.push(root);
  const files = auditSourceTree().checks.filter(({ id }) => id.startsWith("required:"))
    .map(({ id }) => id.slice("required:".length));
  files.push("scripts/publish-acceptance-status.mjs");
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(import.meta.dirname, "..", "..", file), join(root, file));
  }
  return root;
}

function apiFixture(mode: "rulesets" | "legacy" = "rulesets") {
  const policy = {
    ...GOVERNANCE_POLICY,
    requiredStatusChecks: ["quality", "trusted-acceptance"],
    environmentReviewers: {
      production: [{ type: "User", name: "fixture-reviewer" }],
      systemMaintenance: [{ type: "User", name: "fixture-reviewer" }],
    },
    trustedPublisherApp: { privateKeySecret: "FIXTURE_PUBLISHER_KEY" },
    systemMaintenanceDispatcherApp: { privateKeySecret: "FIXTURE_DISPATCHER_KEY" },
  };
  const env = {
    GH_TOKEN: "synthetic-token-never-log",
    NORTHSTAR_TRUSTED_PUBLISHER_APP_LOGIN: "fixture-publisher[bot]",
    NORTHSTAR_TRUSTED_PUBLISHER_APP_ID: "100",
    NORTHSTAR_DISPATCH_APP_LOGIN: "fixture-dispatcher[bot]",
    NORTHSTAR_DISPATCH_APP_ID: "101",
  };
  const repository = {
    default_branch: "main", owner: { type: "User", login: "fixture-owner" },
    security_and_analysis: {
      secret_scanning: { status: "enabled" },
      secret_scanning_push_protection: { status: "enabled" },
    },
  };
  const ruleset = {
    id: 1, target: "branch", enforcement: "active", bypass_actors: [],
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules: [
      { type: "pull_request", parameters: { require_code_owner_review: true, required_approving_review_count: 1 } },
      { type: "required_status_checks", parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [{ context: "quality" }, { context: "trusted-acceptance", integration_id: 100 }],
      } },
      { type: "non_fast_forward" },
      { type: "deletion" },
    ],
  };
  const protection = {
    required_pull_request_reviews: { require_code_owner_reviews: true, required_approving_review_count: 1, bypass_pull_request_allowances: { users: [], teams: [], apps: [] } },
    required_status_checks: {
      strict: true, contexts: ["quality", "trusted-acceptance"],
      checks: [{ context: "quality", app_id: null }, { context: "trusted-acceptance", app_id: 100 }],
    },
    enforce_admins: { enabled: true }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false },
  };
  const responses = new Map<string, unknown>([
    ["repos/{owner}/{repo}", repository],
    ["repos/{owner}/{repo}/rulesets?per_page=100", mode === "rulesets" ? [{ id: 1 }] : []],
    ["repos/{owner}/{repo}/rulesets/1", ruleset],
    ["repos/{owner}/{repo}/branches/main/protection", mode === "legacy" ? protection : new Error("gh: Branch not protected (HTTP 404)")],
    ["apps/fixture-publisher", { id: 100, slug: "fixture-publisher" }],
    ["apps/fixture-dispatcher", { id: 101, slug: "fixture-dispatcher" }],
    ["repos/{owner}/{repo}/actions/secrets?per_page=100", { secrets: [] }],
  ]);
  const names = ["production", "system-maintenance", "trusted-publisher"];
  responses.set("repos/{owner}/{repo}/environments?per_page=100", { total_count: names.length, environments: names.map((name) => ({ name })) });
  for (const name of names) {
    responses.set(`repos/{owner}/{repo}/environments/${name}`, {
      name, can_admins_bypass: false,
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [{
        type: "required_reviewers", prevent_self_review: true,
        reviewers: [{ type: "User", reviewer: { login: "fixture-reviewer" } }],
      }],
    });
    responses.set(`repos/{owner}/{repo}/environments/${name}/deployment-branch-policies?per_page=100`, { branch_policies: [{ type: "branch", name: "main" }] });
    responses.set(`repos/{owner}/{repo}/environments/${name}/secrets?per_page=100`, {
      secrets: name === "production" ? [] : [
        { name: "FIXTURE_PUBLISHER_KEY" },
        ...(name === "trusted-publisher" ? [{ name: "FIXTURE_DISPATCHER_KEY" }] : []),
      ],
    });
  }
  const calls: string[][] = [];
  const run = (args: string[]) => {
    calls.push(args);
    const route = args.at(-1)!;
    if (!responses.has(route)) throw new Error(`Unexpected synthetic route ${route}`);
    const data = responses.get(route);
    if (data instanceof Error) throw data;
    return JSON.stringify(args.includes("--slurp") ? [data] : data);
  };
  return { policy, env, responses, calls, run, repository, ruleset, protection };
}

describe("source-controlled governance", () => {
  it("accepts the reviewed literal or exact repository-default publisher checkout", () => {
    const workflow = readFileSync(join(import.meta.dirname, "..", "..", ".github", "workflows", "publish-evidence.yml"), "utf8");
    for (const ref of ["main", "'main'", '"main"', "refs/heads/main", "${{ github.event.repository.default_branch }}"]) {
      const candidate = workflow.replace(/^ {10}ref:.*$/m, `          ref: ${ref}`);
      expect(publisherUsesTrustedDefaultBranch(candidate)).toBe(true);
    }
  });

  it("rejects PR/event heads, arbitrary refs, and fallback expressions in the publisher checkout", () => {
    const workflow = readFileSync(join(import.meta.dirname, "..", "..", ".github", "workflows", "publish-evidence.yml"), "utf8");
    for (const ref of [
      "${{ github.event.workflow_run.head_sha }}",
      "${{ github.event.workflow_run.head_branch }}",
      "${{ github.event.pull_request.head.sha }}",
      "${{ github.head_ref }}",
      "${{ github.event.repository.default_branch || github.event.workflow_run.head_sha }}",
      "refs/tags/main", "feature/unreviewed",
    ]) {
      const candidate = workflow.replace(/^ {10}ref:.*$/m, `          ref: ${ref}`) +
        "\n# ref: main\n# github.event.repository.default_branch\n";
      expect(publisherUsesTrustedDefaultBranch(candidate)).toBe(false);
    }
  });

  it("does not let a trusted checkout hide another checkout or a repository override", () => {
    const workflow = readFileSync(join(import.meta.dirname, "..", "..", ".github", "workflows", "publish-evidence.yml"), "utf8");
    expect(publisherUsesTrustedDefaultBranch(workflow.replace(
      /^ {10}ref:.*$/m, "          ref: main\n          repository: untrusted/other",
    ))).toBe(false);
    expect(publisherUsesTrustedDefaultBranch(workflow.replace(
      /^ {10}ref:.*$/m, "          ref: main\n          ref: ${{ github.head_ref }}",
    ))).toBe(false);
    expect(publisherUsesTrustedDefaultBranch(workflow +
      "\n      - uses: actions/checkout@v7\n        with:\n          ref: ${{ github.head_ref }}\n")).toBe(false);
    expect(publisherUsesTrustedDefaultBranch(workflow.replace(
      /^ {6}- uses: actions\/checkout@v7$/m,
      "      - name: Unrecognized checkout layout\n        uses: actions/checkout@v7",
    ))).toBe(false);
  });

  it("keeps every required local control present and internally consistent", () => {
    const report = auditSourceTree();
    const failures = report.checks.filter(({ ok }) => !ok);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(report.sourceControlsReady).toBe(true);
  });

  it("identifies reviewed customization seams", () => {
    const policy = readFileSync(".github/governance/policy.json", "utf8");
    const workflow = readFileSync(".github/workflows/governed-change.yml", "utf8");
    const audit = readFileSync("scripts/governance-audit.mjs", "utf8");
    const compiler = readFileSync("scripts/compile-agentic.mjs", "utf8");

    expect(policy).toContain('"$comment": "CUSTOMIZE');
    expect(workflow).toContain("CUSTOMIZE for a new repository");
    expect(audit).toContain("CUSTOMIZE");
    expect(compiler).toContain("CUSTOMIZE");
  });

  it("routes repository-control App identities through configured variables", () => {
    const workflow = readFileSync(".github/workflows/governed-change.yml", "utf8");
    expect(governedRepositoryControlsHaveAppIdentity(workflow)).toBe(true);
    expect(governedRepositoryControlsHaveAppIdentity(
      workflow.replace("NORTHSTAR_TRUSTED_PUBLISHER_APP_ID: ${{ vars.TRUSTED_PUBLISHER_APP_ID }}", ""),
    )).toBe(false);
    expect(workflow).not.toMatch(
      /TRUSTED_PUBLISHER_APP_PRIVATE_KEY|SYSTEM_MAINTENANCE_DISPATCH_APP_PRIVATE_KEY/,
    );
  });

  it("uses a distinct read-only App token for trusted repository-control queries", () => {
    const workflow = readFileSync(
      ".github/workflows/publish-evidence.yml",
      "utf8",
    );
    expect(trustedControlsUseReadOnlyToken(workflow)).toBe(true);
    expect(
      trustedControlsUseReadOnlyToken(
        workflow.replace(
          /(^ {6}- id: controls-token[\s\S]*?^ {10}permission-administration:) read(?=\r?$)/m,
          "$1 write",
        ),
      ),
    ).toBe(false);
    expect(
      trustedControlsUseReadOnlyToken(
        workflow.replace(
          "GH_TOKEN: ${{ steps.controls-token.outputs.token }}",
          "GH_TOKEN: ${{ steps.publisher-token.outputs.token }}",
        ),
      ),
    ).toBe(false);
  });

  it("labels hosted repository controls as unverified rather than pretending", () => {
    expect(new Set(Object.values(auditSourceTree().externalControls))).toEqual(
      new Set(["not-verified"]),
    );
  });

  it("preserves the governed acceptance database boundary", () => {
    const workflow = readFileSync(
      ".github/workflows/governed-change.yml",
      "utf8",
    );
    expect(governedAcceptanceDatabaseUrlIsSafe(workflow)).toBe(true);
  });

  it("starts the governed change workflow", () => {
    const workflow = readFileSync(
      ".github/workflows/governed-change.yml",
      "utf8",
    );
    expect(workflow).toMatch(/^\s{2}plan-contract:\s*$/m);
    expect(governedAcceptanceDatabaseUrlIsSafe(workflow)).toBe(true);
  });

  it("rejects an invalid governed workflow database URL", () => {
    const workflow = readFileSync(
      ".github/workflows/governed-change.yml",
      "utf8",
    );
    const invalid = workflow.replace(
      /^\s*DATABASE_URL:.*$/m,
      "      DATABASE_URL: ******localhost:5432/northstar",
    );
    expect(invalid).not.toBe(workflow);
    expect(governedAcceptanceDatabaseUrlIsSafe(invalid)).toBe(false);
  });

  it("routes governed artifacts to their expected directory", () => {
    const workflow = readFileSync(
      ".github/workflows/governed-change.yml",
      "utf8",
    );
    expect(governedArtifactsTargetExpectedDirectory(workflow)).toBe(true);
    expect(
      governedArtifactsTargetExpectedDirectory(
        workflow.replace(
          /(pattern: northstar-check-\*\r?\n\s+)path: artifacts/,
          "$1path: .",
        ),
      ),
    ).toBe(false);
  });

  it("grants evidence the task lookup permissions", () => {
    const workflow = readFileSync(
      ".github/workflows/governed-change.yml",
      "utf8",
    );
    expect(governedEvidenceTaskLookupPermissionsAreSafe(workflow)).toBe(true);
    expect(
      governedEvidenceTaskLookupPermissionsAreSafe(
        workflow.replace(
          /( {2}evidence:[\s\S]*? {4}permissions:\r?\n(?: {6}[^\r\n]+\r?\n)*?) {6}pull-requests: read\r?\n/,
          "$1",
        ),
      ),
    ).toBe(false);
  });

  it("completes the governed evidence handoff", () => {
    const workflow = readFileSync(
      ".github/workflows/governed-change.yml",
      "utf8",
    );
    expect(governedArtifactsTargetExpectedDirectory(workflow)).toBe(true);
    expect(governedSingleCheckArtifactsPreserveDirectory(workflow)).toBe(true);
    expect(governedEvidenceTaskLookupPermissionsAreSafe(workflow)).toBe(true);
    expect(governedMergedArtifactsHaveUniquePaths(workflow)).toBe(true);
    expect(governedScopeUsesPullRequestContext(workflow)).toBe(true);
    expect(governedRepositoryControlsHaveAppIdentity(workflow)).toBe(true);
    expect(
      governedSingleCheckArtifactsPreserveDirectory(
        workflow.replace(
          "path: artifacts/**/secret-scan.json",
          "path: artifacts/checks/secret-scan.json",
        ),
      ),
    ).toBe(false);
    expect(
      governedMergedArtifactsHaveUniquePaths(
        workflow.replaceAll(
          "quality-governance-report.json",
          "governance-report.json",
        ),
      ),
    ).toBe(false);
    expect(
      governedRepositoryControlsHaveAppIdentity(
        workflow.replace(
          "NORTHSTAR_TRUSTED_PUBLISHER_APP_LOGIN: ${{ vars.TRUSTED_PUBLISHER_APP_LOGIN }}",
          "",
        ),
      ),
    ).toBe(false);
    expect(
      governedScopeUsesPullRequestContext(
        workflow.replace(
          /npm run scope:check --\r?\n\s+--pr "\$PR_NUMBER"\r?\n\s+--expected-head "\$NORTHSTAR_HEAD_SHA"/,
          'npm run scope:check -- --base "$BASE_SHA"',
        ),
      ),
    ).toBe(false);
    expect(
      governedScopeUsesPullRequestContext(
        workflow.replace(
          /(\s+- id: scope\r?\n\s+continue-on-error: true\r?\n)\s+env:\r?\n\s+GH_TOKEN: \$\{\{ github\.token \}\}\r?\n/,
          "$1",
        ),
      ),
    ).toBe(false);
  });

  it("ignores a ruleset that excludes the default branch", () => {
    expect(
      rulesetAppliesToDefaultBranch(
        {
          enforcement: "active",
          target: "branch",
          conditions: {
            ref_name: {
              include: ["~DEFAULT_BRANCH"],
              exclude: ["refs/heads/main"],
            },
          },
        },
        "main",
      ),
    ).toBe(false);
  });

  it("rejects every ruleset bypass mode", () => {
    for (const bypass_mode of ["always", "pull_request", "exempt"]) {
      expect(
        hasRulesetBypass({
          bypass_actors: [{ actor_id: 1, bypass_mode }],
        }),
      ).toBe(true);
    }
  });

  it("requires an exact typed environment reviewer allowlist", () => {
    const rule = {
      prevent_self_review: true,
      reviewers: [
        { type: "User", reviewer: { login: "webmaxru" } },
      ],
    };
    expect(
      environmentReviewersMatch(rule, [
        { type: "User", name: "webmaxru" },
      ]),
    ).toBe(true);
    expect(
      environmentReviewersMatch(
        {
          ...rule,
          reviewers: [
            ...rule.reviewers,
            { type: "Team", reviewer: { slug: "unexpected" } },
          ],
        },
        [{ type: "User", name: "webmaxru" }],
      ),
    ).toBe(false);
    expect(
      environmentReviewersMatch(rule, [
        { type: "Team", name: "webmaxru" },
      ]),
    ).toBe(false);
  });

  it("requires status checks to be current with the base branch", () => {
    expect(
      strictStatusChecksEnabled(
        { required_status_checks: { strict: true } },
        [],
      ),
    ).toBe(true);
    expect(
      strictStatusChecksEnabled(
        { required_status_checks: { strict: false } },
        [
          {
            rules: [
              {
                type: "required_status_checks",
                parameters: {
                  strict_required_status_checks_policy: true,
                },
              },
            ],
          },
        ],
      ),
    ).toBe(true);
    expect(
      strictStatusChecksEnabled(
        { required_status_checks: { strict: false } },
        [],
      ),
    ).toBe(false);

    expect(
      strictRequiredContexts(
        {
          required_status_checks: {
            strict: false,
            contexts: ["quality"],
          },
        },
        [
          {
            rules: [
              {
                type: "required_status_checks",
                parameters: {
                  strict_required_status_checks_policy: true,
                  required_status_checks: [{ context: "trusted-acceptance" }],
                },
              },
              {
                type: "required_status_checks",
                parameters: {
                  strict_required_status_checks_policy: false,
                  required_status_checks: [{ context: "quality" }],
                },
              },
            ],
          },
        ],
      ),
    ).toEqual(new Set(["trusted-acceptance"]));
  });

  it("restricts privileged environments to the exact default branch", () => {
    expect(
      environmentAllowsOnlyDefaultBranch(
        {
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true,
          },
        },
        [{ type: "branch", name: "main" }],
        "main",
      ),
    ).toBe(true);
    expect(
      environmentAllowsOnlyDefaultBranch(
        {
          deployment_branch_policy: {
            protected_branches: true,
            custom_branch_policies: false,
          },
        },
        [],
        "main",
      ),
    ).toBe(false);
    expect(
      environmentAllowsOnlyDefaultBranch(
        {
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true,
          },
        },
        [
          { type: "branch", name: "main" },
          { type: "branch", name: "release/*" },
        ],
        "main",
      ),
    ).toBe(false);
  });

  it("requires exact secret environment placement", () => {
    expect(
      exactStringSet(
        ["trusted-publisher", "system-maintenance"],
        ["system-maintenance", "trusted-publisher"],
      ),
    ).toBe(true);
    expect(
      exactStringSet(
        ["trusted-publisher", "system-maintenance", "staging"],
        ["system-maintenance", "trusted-publisher"],
      ),
    ).toBe(false);
  });
});

describe("explicit optional capability adoption", { timeout: 20000 }, () => {
  it("keeps enabled defaults unless capability booleans are explicitly supplied", () => {
    expect(optionalCapabilities({})).toEqual({ mcp: true, continuousAI: true });
    expect(optionalCapabilities({ optionalCapabilities: { mcp: false } })).toEqual({ mcp: false, continuousAI: true });
    for (const value of [null, [], "disabled", { mcp: "false" }, { continuousAI: null }]) {
      expect(() => optionalCapabilities({ optionalCapabilities: value })).toThrow(/optionalCapabilities/);
    }
  });

  it("allows disabled optional capabilities to be absent without waiving core controls", () => {
    const root = sourceFixture();
    for (const file of [".github/mcp.json", ".github/workflows/daily-repository-status.md", ".github/workflows/daily-repository-status.lock.yml"]) {
      rmSync(join(root, file));
    }
    const policy = { ...GOVERNANCE_POLICY, optionalCapabilities: { mcp: false, continuousAI: false } };
    const report = auditSourceTree({ root, policy, trackedFiles: [] });
    expect(report.checks.filter(({ ok }) => !ok)).toEqual([]);
    expect(report.sourceControlsReady).toBe(true);
    expect(report.checks.filter(({ id }) => id.startsWith("capability:"))).toHaveLength(2);
    rmSync(join(root, "AGENTS.md"));
    expect(auditSourceTree({ root, policy, trackedFiles: [] }).sourceControlsReady).toBe(false);
  });

  it("rejects missing enabled capabilities and active files labelled disabled", () => {
    const root = sourceFixture();
    expect(auditSourceTree({
      root, trackedFiles: [],
      policy: { ...GOVERNANCE_POLICY, optionalCapabilities: { mcp: false, continuousAI: false } },
    }).checks.filter(({ id, ok }) => id.startsWith("capability:") && !ok)).toHaveLength(2);
    rmSync(join(root, ".github", "mcp.json"));
    expect(auditSourceTree({ root, trackedFiles: [] }).checks).toContainEqual(expect.objectContaining({
      id: "required:.github/mcp.json", ok: false,
    }));
  });

  it("retains other source checks and explicit read diagnostics when one source is unreadable", () => {
    const root = sourceFixture();
    const report = auditSourceTree({
      root, trackedFiles: [],
      read: (file) => {
        if (file.endsWith("mcp.json")) throw Object.assign(new Error("private diagnostic"), { code: "EACCES" });
        return readFileSync(file, "utf8");
      },
    });
    expect(report.sourceControlsReady).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ id: "read:.github/mcp.json", ok: false, detail: expect.stringContaining("EACCES") }));
    expect(report.checks).toContainEqual(expect.objectContaining({ id: "workflow:trusted-publisher", ok: true }));
    expect(new Set(report.checks.map(({ id }) => id)).size).toBe(report.checks.length);
    expect(JSON.stringify(report)).not.toContain("private diagnostic");
  });
});

describe("authenticated hosted governance", () => {
  it("summarizes unavailable hosted-control lookups without exposing response text", () => {
    expect(summarizeOnlineFailures({
      checks: [
        { id: "hosted:branch-controls", ok: false, status: "unavailable" },
        { id: "hosted:repository", ok: true, status: "pass" },
      ],
      lookups: [
        { id: "publisher-app", state: "unavailable", detail: "Authenticated lookup failed (HTTP 404). Sensitive body omitted." },
        { id: "repository", state: "available" },
      ],
    })).toEqual([
      "hosted:branch-controls=unavailable",
      "lookup:publisher-app=unavailable-http-404",
    ]);
  });

  it("reports authenticated governance lookup failures explicitly", () => {
    const f = apiFixture();
    expect(onlineControls(f).ready).toBe(true);
    f.responses.set("repos/{owner}/{repo}/actions/secrets?per_page=100",
      new Error(`gh: Resource not accessible (HTTP 403) ${f.env.GH_TOKEN}`));
    f.responses.set("repos/{owner}/{repo}/environments/system-maintenance",
      new Error("gh: Not Found (HTTP 404)"));
    const report = onlineControls(f);
    expect(report).toMatchObject({ available: false, ready: false, authentication: "GH_TOKEN", rulesetCount: 1 });
    expect(report.checks).toContainEqual(expect.objectContaining({ id: "hosted:strict-status-checks", status: "pass", ok: true }));
    expect(report.checks).toContainEqual(expect.objectContaining({ id: "hosted:secret-scanning", status: "pass" }));
    expect(report.checks).toContainEqual(expect.objectContaining({ id: "hosted:system-maintenance-reviewers", status: "unavailable", ok: false }));
    expect(report.lookups).toContainEqual(expect.objectContaining({
      id: "repository-secrets", state: "unavailable", detail: expect.stringContaining("HTTP 403"),
    }));
    expect(JSON.stringify(report)).not.toContain(f.env.GH_TOKEN);
    expect(report.note).toMatch(/Successful checks are retained.*administrator\/App/);
  });

  it.each(["rulesets", "legacy"] as const)("accepts fully verified %s without requiring both branch-control mechanisms", (mode) => {
    const f = apiFixture(mode);
    expect(onlineControls(f)).toMatchObject({ available: true, ready: true });
  });

  it("does not discard verified legacy protection when the unused rulesets API is unavailable", () => {
    const f = apiFixture("legacy");
    f.responses.set("repos/{owner}/{repo}/rulesets?per_page=100", new Error("gh: Resource not accessible (HTTP 403)"));
    const report = onlineControls(f);
    expect(report.ready).toBe(true);
    expect(report.lookups).toContainEqual(expect.objectContaining({ id: "rulesets", state: "unavailable" }));
  });

  it("makes no API requests without explicit authentication and never invents App identities", () => {
    const f = apiFixture();
    const report = onlineControls({ ...f, env: {} });
    expect(report.ready).toBe(false);
    expect(report.available).toBe(false);
    expect(f.calls).toEqual([]);
    expect(report.lookups).toContainEqual(expect.objectContaining({ id: "repository", detail: expect.stringContaining("authentication is missing") }));
    const incomplete = onlineControls({ ...f, env: { GH_TOKEN: f.env.GH_TOKEN } });
    expect(incomplete.checks).toContainEqual(expect.objectContaining({ id: "hosted:trusted-publisher-identity", status: "unavailable" }));
    expect(f.calls.some((args) => args.at(-1)?.includes("apps/"))).toBe(false);
  });

  it("uses paginated inventory APIs and fails an incomplete inventory explicitly", () => {
    const f = apiFixture();
    f.responses.set("repos/{owner}/{repo}/environments?per_page=100", { total_count: 4, environments: [{ name: "production" }] });
    const report = onlineControls(f);
    expect(report.checks).toContainEqual(expect.objectContaining({ id: "hosted:environment-scoped-app-keys", status: "unavailable" }));
    expect(f.calls).toContainEqual(["api", "--paginate", "--slurp", "repos/{owner}/{repo}/environments?per_page=100"]);
  });

  it("distinguishes a disabled setting from settings hidden by missing administrator access", () => {
    const f = apiFixture();
    f.repository.security_and_analysis.secret_scanning.status = "disabled";
    expect(onlineControls(f).checks).toContainEqual(expect.objectContaining({ id: "hosted:secret-scanning", status: "fail" }));
    f.responses.set("repos/{owner}/{repo}", { ...f.repository, security_and_analysis: {} });
    expect(onlineControls(f).checks).toContainEqual(expect.objectContaining({ id: "hosted:secret-scanning", status: "unavailable" }));
  });

  it("does not mistake a nonmatching or bypassable ruleset for enforced protection", () => {
    const f = apiFixture();
    f.responses.set("repos/{owner}/{repo}/rulesets/1", { ...f.ruleset, bypass_actors: [{ actor_id: 1, bypass_mode: "always" }] });
    expect(onlineControls(f).ready).toBe(false);
    f.responses.set("repos/{owner}/{repo}/rulesets/1", { ...f.ruleset, conditions: { ref_name: { include: ["refs/heads/other"], exclude: [] } } });
    expect(onlineControls(f).checks).toContainEqual(expect.objectContaining({ id: "hosted:branch-controls", status: "fail" }));
  });

  it("keeps successful checks when one API returns malformed nested metadata", () => {
    const f = apiFixture();
    f.responses.set("repos/{owner}/{repo}/rulesets/1", {
      ...f.ruleset, rules: [{ type: "required_status_checks", parameters: { required_status_checks: {} } }],
    });
    const report = onlineControls(f);
    expect(report.ready).toBe(false);
    expect(report.lookups).toContainEqual(expect.objectContaining({ id: "ruleset:1", state: "unavailable" }));
    expect(report.checks).toContainEqual(expect.objectContaining({ id: "hosted:production-reviewers", status: "pass" }));
  });

  it("uses the native read token in the scheduled workflow without introducing a personal token", () => {
    const workflow = readFileSync(join(import.meta.dirname, "..", "..", ".github", "workflows", "governance-review.yml"), "utf8");
    expect(workflow).toMatch(/GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/);
    expect(workflow).toMatch(/permissions:\s*\r?\n\s+contents: read/);
    expect(workflow).not.toMatch(/secrets\.|contents: write|administration: write/);
  });
});
