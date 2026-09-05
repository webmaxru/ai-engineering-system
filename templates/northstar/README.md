# Northstar control-plane snapshot

This directory is an inert snapshot of the installed control plane in
[`webmaxru/northstar-orders-api-demo`](https://github.com/webmaxru/northstar-orders-api-demo).
It is stored below `templates/`, so GitHub does not activate the nested hooks,
agents, or workflows in this repository.

## Contents

| Path | Purpose |
| --- | --- |
| `AGENTS.snapshot.md` | Reference repository operating contract, renamed to remain inert |
| `.github/ISSUE_TEMPLATE/agent-task.yml` | Task contract |
| `.github/agents/` | Planner, implementer, dependency, security, and risk-review roles |
| `.github/hooks/` | Native Copilot lifecycle wiring |
| `.github/governance/policy.json` | Risk, checks, owners, and hosted-control expectations |
| `.github/workflows/` | Plan, evaluation, evidence, maintenance, production, governance, and Continuous AI workflows |
| `scripts/` | Contract, approval, authorization, scope, evidence, recovery, and audit implementation |
| `tests/unit/` | Focused control-plane tests |
| `tests/fixtures/` | Explicitly non-authoritative parser and demo inputs |

## Source of truth

Northstar is the executable source for these files. Modify and validate a
system behavior there first, then refresh this snapshot and update
`reference-lock.json`.

The source repository's `AGENTS.md` is renamed to `AGENTS.snapshot.md` here so
agent tooling cannot discover and apply the reference repository's operating
contract to this template directory.

The snapshot is useful for study and comparison. It is not independently
runnable because application tests, dependencies, package scripts, and hosted
configuration remain in Northstar.

## Adoption warning

Do not copy the directory wholesale and assume the result is safe. The files
contain Northstar-specific:

- schema names;
- paths and commands;
- required check names;
- environment and GitHub App assumptions;
- application acceptance criteria;
- CODEOWNERS and reviewer configuration.

Derive a task contract, risk policy, capability map, and evidence model for the
target repository, then test them against that repository's real behavior.
