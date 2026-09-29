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

The locked Northstar baseline `b65c2de5c8224342c72c37eeed7ef9f965ad8a2c` is
**known defective**. Earlier terminology and workflow fixes are merged. On
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

The issue #14 implementation candidate PR #18 is now at
`a7664bfef3f587dbd767efd421979480e2ad889e`. Local validation passes with 469
unit tests, and dedicated PostgreSQL acceptance passes 9/9 after the privacy
test was isolated in a per-run schema. The high `fast-uri` advisory still
blocks dependency review. Issue #14's refreshed contract and PR #15's proposed
plan now specify a post-bootstrap, pre-final-acceptance AC15 canary; both the
new plan approval and exact-head implementation review are pending. No
trusted acceptance or ruleset change is claimed. See
[`GUIDE-CONFORMANCE.md`](GUIDE-CONFORMANCE.md) for the exact digests, checks,
and controlled-bootstrap boundary.

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
