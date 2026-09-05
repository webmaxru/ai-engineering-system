# AI Engineering System repository instructions

This repository is the canonical description of the AI engineering system. It
is deliberately outside the system's own enforcement boundary.

## Non-self-governance rule

Do not add active agent hooks, custom agents, agentic workflows, enforcement
workflows, or tool-authorization scripts to this repository.

Inert snapshots are permitted only below `templates/`. They must not be
referenced by root repository configuration, and instruction files that could
be discovered by an agent must use non-active names such as
`AGENTS.snapshot.md`.

Human maintainers retain ordinary Git and GitHub authority here. Review remains
required by team practice, not by a copy of the system under design.

## Required reference implementation

Every normative change to this repository must be implemented and tested in
[`webmaxru/northstar-orders-api-demo`](https://github.com/webmaxru/northstar-orders-api-demo)
before the system change is considered complete.

A normative change includes any change to:

- terminology or lifecycle semantics;
- task, plan, approval, risk, scope, or evidence contracts;
- agent roles or capability boundaries;
- hooks, MCP governance, workflows, safe outputs, or hosted controls;
- recovery, maintenance, observability, or acceptance requirements;
- quickstart steps that claim executable behavior.

The change record must identify:

1. the exact Northstar commit SHA;
2. the Northstar branch or pull request;
3. the focused tests for the changed behavior;
4. the full validation command and result;
5. the PostgreSQL acceptance result when process-boundary behavior is
   relevant;
6. hosted evidence or an explicit statement that hosted controls remain
   unverified.

Edits to this repository alone are never sufficient evidence that the system
works.

## Change order

1. Read the learning guide and the affected system documents.
2. State the proposed semantic or architectural change.
3. Implement it in Northstar under Northstar's active task contract and
   governance controls.
4. Run the focused and complete reference validation.
5. Update this repository to describe only the behavior proved by Northstar.
6. When control-plane files changed, refresh `templates/northstar/` and its
   `reference-lock.json` from the validated Northstar commit.
7. Link the exact evidence in the change description.

Pure spelling, formatting, and broken-link fixes do not require a Northstar
code change, but they must not alter normative meaning.

## Documentation rules

- Use the canonical terms in `docs/TERMINOLOGY.md`.
- Keep **plan -> act -> evaluate** and
  **agents propose; humans and policy accept** as the central model.
- Distinguish local `ready_for_review` from hosted
  `ready_for_acceptance`.
- Never describe a repository file as proof that an external GitHub setting is
  enabled.
- Expose limitations and unverified controls instead of filling gaps with
  success-shaped language.
- Keep the Northstar application fictional and do not present its incidents,
  identifiers, or metrics as real.
