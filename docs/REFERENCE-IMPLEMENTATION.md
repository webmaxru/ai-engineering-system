# Reference implementation

The executable proof of concept is
[`webmaxru/northstar-orders-api-demo`](https://github.com/webmaxru/northstar-orders-api-demo).

Its strict mapping to the non-negotiable
[`Developing-in-Agentic-AI-Systems-Learning-Paths.md`](Developing-in-Agentic-AI-Systems-Learning-Paths.md)
is recorded in
[`GUIDE-CONFORMANCE.md`](GUIDE-CONFORMANCE.md). Reference mechanisms that make
the guide concrete without being prescribed by it are recorded in
[`TECHNICAL-EXTENSIONS.md`](TECHNICAL-EXTENSIONS.md).

## Current release status

Northstar `main` remains at known-defective baseline
`b65c2de5c8224342c72c37eeed7ef9f965ad8a2c`. The inert control-plane snapshot
is refreshed to validated candidate `bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7`
from open, draft PR #27 and remains `known-defective`; it is not an adoption
release. Earlier terminology and workflow fixes are merged. On
2026-09-28 the owner reopened system-maintenance issues #14, #16, #20, #22 and
#24 and their associated plan/implementation PRs to resume conformance
remediation. Their earlier closures were cancellations, not accepted fixes;
no maintenance PR has been merged, and no repository setting was changed.

Demo issue #4 (WI-1842) and issue #17 (WI-1843) remain open; PR #19 remains a
draft demo candidate. Its exact-head review and hosted `human-review` pass,
and local application/PostgreSQL checks pass, but the full Zizmor run reports
86 findings and hosted `repository-controls` fails. The demo candidates are
not an accepted release; see [`GUIDE-CONFORMANCE.md`](GUIDE-CONFORMANCE.md)
for the exact refs and blockers.
Northstar remains an inspectable proof of concept, not an adoption source.

The reopened scanner-remediation plan PR #21 is refreshed at head
`6795e32beba33e7ac109bf020ae8f3b377042cc4`, bound to base
`17e7a5c5f1fbf88a92351043c675f555f4c7f04f`; local plan validation and hosted
`plan-contract`/`require-plan` pass. The exact-head review, `plan-approval`,
and `human-review` checks now pass; hosted evidence and `repository-controls`
remain unresolved. Issue #20 remains blocked by issue #22; no scanner finding
has been fixed.

The issue #14 implementation candidate
[PR #18](https://github.com/webmaxru/northstar-orders-api-demo/pull/18) is at
`2ce3cf8a69439c22246de7d5449ce186e23bd584` on
`agent/implement/aes-surface-evidence`. Local `npm run validate` passes
489 unit tests; isolated PostgreSQL acceptance passes 9/9;
`npm audit --audit-level=high` reports zero vulnerabilities; and
`npm run agentic:compile` passes. The approved PR #15 plan (`e5ce0f4c…`,
review `5353720051`) stages AC15 after controlled bootstrap activation but
before final acceptance. The candidate adds a protected, exact-head
browser-plan canary and keeps `ready_for_acceptance` blocked until that
evidence is present.

PR #18 remains open and unmerged. Its exact native review (5356731352) is
approved, but hosted `human-review` fails because GitHub reports
`reviewDecision` as not `APPROVED`; repository-controls lookups return
HTTP 403, and `trusted-acceptance` remains failure. The
[source report](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/36610256698)
is `ready_for_review` with AC15 unverified and 14/15 criteria proven; the
[review-event report](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/36612195971)
is `review_required`, and the
[trusted-acceptance run](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/36612770691)
fails. Local `agentic:zizmor` remains blocked with 85 findings. No ruleset,
App permission, or secret changed, and no acceptance or conformance is
claimed. Issue #24 plan
[PR #25](https://github.com/webmaxru/northstar-orders-api-demo/pull/25) has
been refreshed to contract `93a40b20…` and base `2ce3cf8…`, and is approved
on exact head `7d0a78d8da741c911a31941477562060ae6c6d66` (review `5357419226`).
Child PR #28 is rebased and pushed at `35ac91150fa4088af3132a9dda75bc690d657165`
on that parent base. Its local task/plan, scope, merge, 525-unit, and 9/9
acceptance checks pass; `validate:all` remains blocked by 79 repository-wide
Zizmor findings. Hosted run `36635911460` passes plan, scope, quality,
acceptance, CodeQL, secret scan, dependency review, merge validation,
governance, and evidence, but `human-review` and `repository-controls` fail.
PR #28 remains draft and unmerged; no trusted acceptance is established. See
[`GUIDE-CONFORMANCE.md`](GUIDE-CONFORMANCE.md) for the exact digests, checks,
and controlled-bootstrap boundary.

Issue #16 plan PR #26 is approved at head
`42721d4ee34a55cb031567d3942dd037e5bbe513` (review `5362561711`), bound to
parent base `2ce3cf8a69439c22246de7d5449ce186e23bd584`, contract
`2afe7ed6…`, and plan `d020ca88…`. Implementation PR #27 is rebased to that
base and at candidate head `bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7`.
`npm run validate` passes 528 unit tests and 79 offline governance checks;
PostgreSQL acceptance passes 10/10. The candidate also gives live task/plan
resolution 90 seconds while retaining the 10-second pre-tool authorization
hook; command-hook timeouts are fail-open, including pre-tool authorization,
so denial is not guaranteed if that hook itself times out. Two simultaneous
local CLI canaries resolved separate owner state at predecessor `bb767fc…`.
Hosted run `36748901455` at this exact head passes plan-contract,
plan-approval, scope, quality, acceptance, CodeQL, dependency review,
secret-scan, merge-validation, and governance. `repository-controls`,
`human-review`, and `evidence` fail; `validation-authority` was not run. The
report is `review_required` with 9/10 criteria proven (AC1–AC8 and AC10);
AC9 remains unproven because cloud task-contract bootstrap failed. The report
also identifies missing trusted current-run revalidation for plan approval,
repository controls, and human review. PR #27 remains draft and unmerged. Full `validate:all` at
`bfb2cbf…` fails at Zizmor with 83 findings (19 `artipacked`, 61
`unpinned-uses`, one each `dangerous-triggers`, `obfuscation`, and
`template-injection`). No acceptance or conformance is claimed.
The inert template snapshot and `reference-lock.json` remain on
`b65c2de5c8224342c72c37eeed7ef9f965ad8a2c`; the unaccepted candidate is not
published as an adoption snapshot.

Northstar is a fictional TypeScript/Fastify Orders API. Its idempotency
requirement is deliberately distributed: retries may reach different stateless
service instances, while PostgreSQL provides shared durability and concurrency
control. That workload prevents a green unit suite from being mistaken for
end-to-end evidence.

## Repository responsibilities

| Repository | Responsibility |
| --- | --- |
| `webmaxru/ai-engineering-system` | Canonical concepts, terminology, goals, architecture, learning material, and adoption guidance |
| `webmaxru/northstar-orders-api-demo` | Installed agents, hooks, policies, workflows, evidence code, application behavior, and executable validation |

The framework repository mirrors Northstar's control-plane files as an inert,
commit-locked snapshot under `templates/northstar/`. The snapshot is not a
second implementation and is never the behavioral source of truth. Northstar
remains the only executable source, and the lock makes drift visible.

## Implementation map

| Concern | Northstar artifact |
| --- | --- |
| Task contract | [`.github/ISSUE_TEMPLATE/agent-task.yml`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/.github/ISSUE_TEMPLATE/agent-task.yml), [`scripts/task-contract.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/task-contract.mjs) |
| Plan and risk | [`scripts/plan-contract.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/plan-contract.mjs), [`scripts/risk-policy.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/risk-policy.mjs) |
| Plan approval | [`scripts/plan-approval.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/plan-approval.mjs), [plan gate](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/.github/workflows/plan-gate.yml) |
| Agent roles | [`.github/agents/`](https://github.com/webmaxru/northstar-orders-api-demo/tree/main/.github/agents) |
| Tool authorization | [native hook configuration](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/.github/hooks/agent-boundary.json), [`scripts/authorize-tool.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/authorize-tool.mjs) |
| Scope enforcement | [`scripts/check-scope.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/check-scope.mjs) |
| Evaluation | [governed change workflow](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/.github/workflows/governed-change.yml) |
| Evidence | [`scripts/evidence-record.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/evidence-record.mjs), [`scripts/build-execution-report.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/build-execution-report.mjs) |
| Trusted publication | [publish evidence workflow](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/.github/workflows/publish-evidence.yml) |
| Validation-authority maintenance | [system maintenance approval](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/.github/workflows/system-maintenance-approval.yml) |
| Governance drift | [policy](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/.github/governance/policy.json), [`scripts/governance-audit.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/governance-audit.mjs) |
| Recovery | [`scripts/repair-budget.mjs`](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/scripts/repair-budget.mjs) |
| Continuous AI | [agentic workflow source](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/.github/workflows/daily-repository-status.md) and [compiled workflow](https://github.com/webmaxru/northstar-orders-api-demo/blob/main/.github/workflows/daily-repository-status.lock.yml) |
| Application acceptance | [`tests/acceptance/`](https://github.com/webmaxru/northstar-orders-api-demo/tree/main/tests/acceptance) |

## Evidence levels

### Local reference evidence

The locked baseline's local validation reported:

- contracts, policy, agents, hooks, scripts, schemas, and instructions;
- lint, typecheck, build, and unit behavior;
- PostgreSQL acceptance across two service instances;
- dependency and supplemental secret checks;
- merge compatibility and governance policy;
- Agentic Workflow compilation and workflow static analysis;
- a final `ready_for_review` execution report.

The baseline full command passed 220 unit and 8 PostgreSQL tests but printed
five Poutine errors while exiting zero. Two moderate dependency findings
remain. Additional probes exposed false-positive evidence readiness.
See [AUDIT-2026-09-23.md](AUDIT-2026-09-23.md); local output is not sufficient
for this release. Workflow changes require actual hosted jobs and independent
acceptance, not merely a successful parser or unit suite.

### Hosted acceptance evidence required

Only live GitHub evidence can prove:

- current pull-request and review state;
- workflow and CodeQL provenance;
- required status checks;
- CODEOWNERS and ruleset enforcement;
- protected-environment approval;
- GitHub App identities and secret scope;
- the trusted `ready_for_acceptance` decision.

The reference must report unavailable hosted controls as **not verified**,
never as passed.

## Required validation for system changes

At minimum, a normative change should run in Northstar:

```powershell
npm run validate:all
```

Focused tests must also cover the changed behavior. A change involving process
boundaries must include PostgreSQL evidence through independently running
processes; the current `npm run test:acceptance` suite alone uses in-process
services and Fastify injection and does not establish that boundary. A change
to workflows or validation authority must additionally follow Northstar's
protected system-maintenance path and provide hosted evidence when that
configuration is available.

## Experimental Agent Hooks branch

The branch
[`reference/ai-engineering-system-agent-hooks`](https://github.com/webmaxru/northstar-orders-api-demo/tree/reference/ai-engineering-system-agent-hooks)
contains an experimental partial adapter for Responsible AI Agent Hooks. It is
not the canonical reference implementation and is intentionally not merged
into `main`.
