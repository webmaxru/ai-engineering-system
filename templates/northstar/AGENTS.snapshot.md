# Northstar AI engineering system

This repository is a synthetic reference implementation. Northstar Commerce,
its incidents, and its identifiers are fictional.

The operating principle is:

> Agents propose; humans and policy accept.

The control loop is **plan -> act -> evaluate**. Every phase must leave durable,
inspectable evidence in GitHub or in a machine-readable local artifact.

`.github/copilot-instructions.md` is generated from this file. Edit only
`AGENTS.md`, then run `npm run instructions:sync`.

## Before any task

1. Read the issue named by the user. It is the task contract.
2. Read `docs/architecture.md` and every authoritative source named by the
   contract.
3. Establish the repository, base branch, workflow, permissions, and current
   pull request state.
4. Produce a structured plan and a `northstar/plan/1` machine-readable plan
   contract.
5. Classify risk as `low`, `medium`, `high`, or `critical`.
6. Stop before implementation until the approval policy for that risk is met.

Do not infer a task from a branch name, the issue list, a fixture, or chat
history. If a precise task contract is absent, reads are allowed and writes are
denied.

## Task contract

The GitHub issue is the canonical source for:

- **Inputs:** goal, authoritative sources, allowed and prohibited scope,
  constraints, non-goals, validation expectations, and rollout expectations.
- **Outputs:** plan, bounded changeset, pull request, and evidence.
- **Success criteria:** observable behavior and the stable test or check that
  proves each criterion.
- **Stop conditions:** situations that require human escalation.

Fixtures under `tests/fixtures/` are parser and demo inputs, never live
authority.

## Plan and approval

The pull request is the state anchor. It carries the objective, current plan,
decisions and handoffs, risks, rollback, commits, checks, and evidence.

The machine-readable plan must bind:

- task ID and task-contract digest;
- base branch and full base SHA;
- allowed and prohibited paths;
- risk level;
- steps and success-criterion mappings;
- required checks and evidence;
- decisions, handoffs, risks, rollback, and escalation.

This repository uses a plan-first pull request for implementation work. The
planner is read-only. Its Stop hook persists a local proposal; a human must
explicitly publish it. High and critical plans require a human approval bound
to the current plan digest and plan-only commit before write tools are used.
Implementation runs on a separate `agent/implement/<task>` branch created from
the approved base SHA. Final acceptance requires a separate human review of the
latest implementation commit.

## Risk-based autonomy

| Risk | Typical change | Required routing |
| --- | --- | --- |
| Low | Documentation and formatting | Automated checks; reversible |
| Medium | Dependencies and bounded refactors | Pull request, checks, human review |
| High | Workflows, hooks, agents, security, infrastructure, migrations | Plan-only approval, CODEOWNERS, stronger checks |
| Critical | Production deployment or production-secret access | Protected environment, explicit reviewers, audit evidence |

The deterministic policy in `.github/governance/policy.json` sets risk floors.
Narrative confidence cannot lower the required controls.

## Roles

- **Planner:** read and search only; produces the plan and plan contract.
- **Implementer:** edits and executes only inside the approved task scope.
- **Dependency agent:** changes manifests and lockfiles only.
- **Security reviewer:** runs and interprets security evidence; does not edit.
- **Risk reviewer:** reads the diff and evidence; does not edit or repair.

Parallel work is allowed only on isolated paths and branches. Sequential work
uses durable artifacts and explicit handoffs, not hidden agent-to-agent state.

## Context and memory

GitHub is the external memory and system of record:

- issue: requirements and acceptance criteria;
- pull request: plan, decisions, implementation, evidence, and review;
- branch and commits: isolated action history;
- Actions runs, logs, and artifacts: validation evidence;
- review and environment events: human acceptance.

Retain only outcome-relevant requirements, decisions, constraints, and
validation results. Do not treat transient reasoning or copied context as
authority. On resume, re-read the issue, pull request, current head, base,
checks, and latest approvals before acting.

## Capability boundary

- Workflow permissions default to read-only and elevate only per job.
- Planning and review agents have no edit tools.
- Implementation tools are enabled only after an approved plan is resolved.
- Tool writes must remain inside the task scope; prohibited paths beat allowed
  paths.
- Raw idempotency keys, request payloads, credentials, and secret values must
  not enter source, logs, hook records, or evidence.
- Publishing, merging, workflow-policy changes, production deployment, and
  secret access require explicit human authorization.
- Dangerous operations are blocked by `PreToolUse`; documentation alone is not
  an enforcement mechanism.
- Hook audit records are payload-free. Local hook files are session evidence,
  not a substitute for durable GitHub workflow evidence.

Copilot command-hook timeouts are fail-open, and cloud-agent `ask` decisions
become deny decisions. Keep pre-tool policy deterministic and fast.

## MCP governance

Use only approved MCP servers from the organization or enterprise registry.
Enable specific tool names, not `*`, unless a human explicitly approves the
expanded blast radius. Runtime credentials must use protected
`COPILOT_MCP_*` secrets or variables and must never be committed.

Adding or expanding an MCP server is a high-risk dependency and policy change.
The built-in GitHub MCP server remains read-only and repository-scoped unless a
human deliberately grants broader access.

## Implementation

- Work on a dedicated branch, never directly on `main`.
- Keep the diff inside the approved plan and task scope.
- Commit incremental, reviewable progress.
- Use existing patterns and dependencies before adding new ones.
- Do not weaken assertions, checks, or evidence requirements.
- Treat `.github/workflows/`, `.github/hooks/`, `.github/agents/`,
  `.github/governance/`, `infra/`, `security/`, and `migrations/` as high risk.
- A pull request that changes its own validation authority cannot approve
  itself. It must first receive a failed `validation-authority` record, then
  pass the protected `system-maintenance` environment before the trusted
  default-branch publisher may emit `trusted-acceptance`.

## Evaluate

The minimum local evidence bundle is:

1. valid task and plan contracts;
2. deterministic scope and policy checks;
3. instruction sync, lint, typecheck, and build;
4. focused unit tests;
5. PostgreSQL acceptance tests for cross-process behavior;
6. dependency audit and supplemental secret scan;
7. merge validation against the selected base;
8. governance audit;
9. a commit-bound execution report.

Hosted acceptance additionally requires CodeQL/SARIF, real workflow runs,
current human approval, required checks, CODEOWNERS enforcement, and any
required environment approval. **Missing evidence is failure.**

`ready_for_review` means local reference evidence is complete.
`ready_for_acceptance` is reserved for complete hosted evidence.

## Recovery

Classify failures before changing anything:

- **reasoning error:** revise the plan or implementation, never the assertion;
- **tool misuse:** correct the command, workflow, or permission configuration;
- **context issue:** refresh the authoritative issue, PR, base, or decision;
- **conflict:** reconcile overlapping changes against the state anchor;
- **policy or security failure:** escalate immediately;
- **transient environment failure:** repair the environment, then retry once.

Stop and escalate when the same required check fails twice with the same
normalized signature, when three attempts are spent, or when the failure is
unclassified. See `docs/RECOVERY-POLICY.md`.

## Operations

Review failed runs and policy violations weekly, workflow permissions and
secret scopes monthly, and rulesets, CODEOWNERS, environments, retention, and
agent ownership quarterly. Agents and guardrails have an explicit lifecycle:
deployment, monitoring, updating, and retirement.

GitHub Agentic Workflows provide bounded **Continuous AI** through read-only
agent execution and staged safe outputs. They extend deterministic CI; they do
not replace required checks or human acceptance.
