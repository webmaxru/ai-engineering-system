import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditSourceTree,
  environmentAllowsOnlyDefaultBranch,
  environmentReviewersMatch,
  exactStringSet,
  governedAcceptanceDatabaseUrlIsSafe,
  governedArtifactsTargetExpectedDirectory,
  governedEvidenceTaskLookupPermissionsAreSafe,
  governedMergedArtifactsHaveUniquePaths,
  governedScopeUsesPullRequestContext,
  governedSingleCheckArtifactsPreserveDirectory,
  hasRulesetBypass,
  rulesetAppliesToDefaultBranch,
  strictRequiredContexts,
  strictStatusChecksEnabled,
} from "../../scripts/governance-audit.mjs";

describe("source-controlled governance", () => {
  it("keeps every required local control present and internally consistent", () => {
    const report = auditSourceTree();
    const failures = report.checks.filter(({ ok }) => !ok);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(report.sourceControlsReady).toBe(true);
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
          /(\s+name: northstar-plan-context\r?\n\s+)path: artifacts/,
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
