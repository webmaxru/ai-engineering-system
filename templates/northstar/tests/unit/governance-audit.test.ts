import { describe, expect, it } from "vitest";
import {
  auditSourceTree,
  environmentAllowsOnlyDefaultBranch,
  environmentReviewersMatch,
  exactStringSet,
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
