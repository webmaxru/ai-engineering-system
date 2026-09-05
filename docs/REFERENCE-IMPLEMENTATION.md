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

The locked Northstar baseline is **known defective**: GitHub rejects
`.github/workflows/governed-change.yml` before creating jobs. The terminology
repair in `webmaxru/northstar-orders-api-demo#7` and the high-risk workflow
repair tracked by `webmaxru/northstar-orders-api-demo#8` and
`webmaxru/northstar-orders-api-demo#9` are not yet accepted on `main`. Until
they are accepted, validated, and captured in a refreshed lock, Northstar is
an inspectable proof of concept but not an adoption source. See
[`GUIDE-CONFORMANCE.md`](GUIDE-CONFORMANCE.md) for the exact blockers.

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

That local result did not detect the hosted workflow parser failure and is
therefore insufficient for the current release. Workflow changes additionally
require a real GitHub run that creates the expected jobs.

### Hosted integration validated

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
boundaries must include `npm run test:acceptance` against PostgreSQL. A change
to workflows or validation authority must additionally follow Northstar's
protected system-maintenance path and provide hosted evidence when that
configuration is available.

## Experimental Agent Hooks branch

The branch
[`reference/ai-engineering-system-agent-hooks`](https://github.com/webmaxru/northstar-orders-api-demo/tree/reference/ai-engineering-system-agent-hooks)
contains an experimental partial adapter for Responsible AI Agent Hooks. It is
not the canonical reference implementation and is intentionally not merged
into `main`.
