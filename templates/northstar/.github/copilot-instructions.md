<!--
  GENERATED FILE - DO NOT EDIT.

  Source: AGENTS.md
  Regenerate: npm run instructions:sync

  AGENTS.md is the vendor-neutral convention and the only file authored by
  hand. This copy exists because some Copilot surfaces do not read AGENTS.md
  yet. See the support matrix:
  https://docs.github.com/en/copilot/reference/custom-instructions-support
-->
# Northstar AI engineering system

This repository is a synthetic reference implementation. Northstar Commerce,
its incidents, and its identifiers are fictional.

The operating principle is:

> Agents propose; humans and policy accept.

The control loop is **plan → act → evaluate**. Every phase must leave durable,
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
Apply the **contributor model**: evaluate the work by its intent, scope,
evidence, ownership, policy, and fallback, not by whether the author is human
or an agent.

The machine-readable plan must bind:

- task ID and task-contract digest;
- base branch and full base SHA;
- allowed and prohibited paths;
- risk level;
- steps and success-criterion mappings;
- required checks and evidence;
- decisions, handoffs, risks, rollback, and escalation.

The planner is read-only. The repository-level Stop dispatcher persists its
local proposal; an explicitly authorized publisher commits the proposal as
`docs/plans/<task-id>.md` and requests eligible human reviewers configured in
`.github/governance/policy.json`. A plan-only PR may add or modify only that
task's non-executable regular Markdown artifact. It cannot contain source,
workflow, symlink, submodule, renamed, or deleted files.

High and critical plans require a real current GitHub APPROVED review of the
plan-only commit before implementation. The resolver binds that native review
to the committed plan, live task digest, base SHA and current plan head.
Changing any binding invalidates approval. A PR-description copy must match
the committed plan. New file-backed plans do not require a reviewer to run
`plan:record-approval`; only the explicitly pinned legacy bootstrap retains
the zero-file plus reviewer-authored-record protocol.

Low and medium work may execute a validated, explicitly handed-off plan before
plan approval, with the risk's required checks and final review still required.
Use `/work <issue>` for the explicit combined route. A fresh local session may
write only `artifacts/plan-proposal.md` until `plan:materialize` with
`--execute-proposed --session-id <current-session-id>` validates the owner,
task, scope, risk and exact base. This does not create an approval. To resume,
explicitly select the implementation
`Task PR: #<number>` or local `Task plan: artifacts/plan.json`; startup never
adopts an arbitrary remaining file. The combined PR carries plan and code
together, and the hosted selector requires independent plan approval only for
high/critical risk.
Local implementation uses `agent/implement/<task>` from the declared base.
Cloud implementation retains the host branch only after resolving the actual
same-repository PR, task, plan, base and current head; its branch prefix alone
grants no authority. Final acceptance targets the latest implementation commit.
Cloud combined execution requires the actual implementation PR to carry its
task-bound proposed plan. Local proposal files do not replace that live PR
binding; absence of the binding remains a visible stop condition.

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

Parallel work is allowed only on isolated paths and branches. Each write-capable
Copilot CLI or cloud-agent task uses its own Git worktree; a shared worktree is
not made safe by separating artifact filenames. Use
`npm run workspace:prepare -- --issue <number> --path <absolute-path> --session-id <current-session-id>`
to create or select the approved task worktree without switching this checkout.
The owner record binds the worktree to its issue, contract, repository, and
session/run identity. A conflicting owner is rejected before task state changes.

Use `npm run workspace:release -- --issue <number> --session-id <current-session-id>`
only to release the exact matching owner. If task authority files exist without
an owner, preserve them and stop; never adopt or delete them as a default.
`workspace:release --clear-unowned` is an explicit recovery that removes only
the known orphaned task authority files and requires human confirmation.
Sequential work uses durable artifacts and explicit handoffs, not hidden
agent-to-agent state.

## GitHub as the system of record and control plane

GitHub is the external memory and source of truth. It is the **system of record
and control plane**:

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
- Implementation tools require a trusted task and validated plan; high/critical
  work additionally requires the current human plan approval.
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
become deny decisions. Keep pre-tool policy deterministic and fast. Hook
compatibility is host-specific; a schema unit test is not a live host canary.
The SessionStart resolver accepts explicit `AGENT_TASK_ISSUE`, documented
`initial_prompt`/`initialPrompt`, or `COPILOT_AGENT_PROMPT` task input.
Conflicting selectors and failed resolution clear only state owned by the
current session. Foreign-owner conflicts and unowned legacy authority are
preserved and fail closed.
UserPromptSubmit output cannot reliably halt every host; PreToolUse still
denies writes without matching task, plan, isolation and session identity.

## MCP governance

Use only approved MCP servers from the organization or enterprise registry.
The organization or enterprise **MCP allow list** decides which registered
servers may be used.
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

`ready_for_review` means local reference evidence for every criterion due at the
approved plan stage is complete; explicitly deferred criteria remain listed and
unverified.
`ready_for_acceptance` requires every task criterion and complete hosted evidence.

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
