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
remediation. Their earlier closures were cancellations, not accepted fixes.
Child PR #28 has since been merged into parent PR #18, but no maintenance PR is
merged into `main`; no repository setting was changed.

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
[PR #18](https://github.com/webmaxru/northstar-orders-api-demo/pull/18) is
now at `2222e882b966588e39a63991ece3a00935898cfc` on
`agent/implement/aes-surface-evidence`, incorporating child PR #28. Its
exact-head review (`5401432763`) is approved. Governed Change run
[`37133142406`](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/37133142406)
passes the source checks except `repository-controls`. The report is
`ready_for_review` with 14/15 criteria proven; AC15 remains unverified.
`repository-controls` and `trusted-acceptance` are still failed required
contexts, so PR #18 is blocked and no acceptance is claimed.

Issue #24 plan PR
[#25](https://github.com/webmaxru/northstar-orders-api-demo/pull/25) is
approved at head `ad4da17e679ba66d28025354021df9cc5ab18158` (review
`5400367350`), bound to contract `8763c017…` and parent base `2ce3cf8…`.
Child PR #28 was merged into PR #18 at `2222e882…`; PR #18 itself remains
open and unmerged. Protected Publish Evidence runs
[`37133208919`](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/37133208919)
and
[`37133310243`](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/37133310243)
on `main` at `b65c2de…` failed during artifact import because that deployed
importer rejected `poutine-report.json`, `poutine.sarif`, and
`zizmor-comparison.json`; the audit did not run.

The importer and path-safety helper at the reviewed PR #18 merge commit have
the same Git blobs as the candidate used in a local replay of all 22 files
from source run `37133142406`; the replay accepted the Poutine and Zizmor
artifacts. This proves the candidate import behavior only. It does not prove
that the protected App audit or trusted status publication succeeded. The
ruleset remains active and strict with an empty bypass list, and its original
`repository-controls` (integration `15368`) and `trusted-acceptance`
(integration `5075466`) requirements remain intact. No settings change,
parent merge, or hosted acceptance is claimed. See
[`GUIDE-CONFORMANCE.md`](GUIDE-CONFORMANCE.md) for the full preflight
evidence and remaining human gate.

Issue #16 plan PR #26 remains approved at head
`42721d4ee34a55cb031567d3942dd037e5bbe513` (review `5362561711`), bound to
parent base `2ce3cf8a69439c22246de7d5449ce186e23bd584`, contract
`2afe7ed6…`, and plan `d020ca88…`. The inert snapshot remains pinned to
candidate `bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7`; that is not the current
live PR #27 head. PR #27 is currently draft at
`f1c40a961451d29fed04ac37ad01eb63ddec076d` on the old `2ce3cf8…` parent
base, which has since advanced to PR #18 head `2222e882…`. Its approved plan
therefore needs a fresh base binding before further implementation.

At current PR #27 head `f1c40a9…`, hosted run
[`36984950941`](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/36984950941)
passes human-review and core plan, scope, quality, acceptance, security,
merge, and governance checks; `repository-controls` and `evidence` fail,
`validation-authority` is absent, and the report is `review_required` with
9/10 criteria proven. AC9 remains unproven because cloud task-contract
bootstrap has not been verified. No acceptance or conformance is claimed.
Local validation at the separate snapshot candidate `bfb2cbf…` passes 528
unit tests and 79 offline governance checks; PostgreSQL acceptance passes
10/10, while full `validate:all` fails at Zizmor with 83 findings (19
`artipacked`, 61 `unpinned-uses`, and one each `dangerous-triggers`,
`obfuscation`, and `template-injection`). These local results do not change
the live PR head or its hosted status.

A later owner-bound local write attempt also stopped before editing. The
workspace records Issue #16, role `implement`, PR #27, the current session
owner, and the approved plan; `approved-plan.json` contains native plan review
`5362561711` for PR #26 head `42721d4…`. However, `plan.json` lacks the
approval envelope, and `authorize-tool.mjs` reads `plan.json` only, so its
exact edit preflight denies the write. The current parser also accepts
`Task PR: #27` only as task input, not as an invocation or implementation
role. No workaround, file edit, or test run was performed; this cache/parser
defect must be corrected through the authorized reference workflow before
local session writes or AC9 can be claimed.
The inert template snapshot and `reference-lock.json` are pinned to
`bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7`; `architecture-lock.json` remains
`known-defective`/`blocked`. That unaccepted snapshot is for inspection, not
adoption, and is distinct from PR #27's live `f1c40a9…` head.

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
