# Apply the AI engineering system to an existing GitHub project

This guide explains how to install and adapt the AI engineering system in an
existing GitHub repository. It assumes the project already has source code,
build and test commands, and a default branch on GitHub.

Do not begin by copying the hook into `.github/hooks/`. The hook is an
enforcement boundary: enabling it before the task contract, plan, commands, and
paths are customized can block legitimate agent work. Build and test the
control plane first, then activate the hook near the end of the bootstrap.

To run the completed Northstar proof of concept instead, use the
[reference implementation walkthrough](REFERENCE-WALKTHROUGH.md).

## Result

At the end of this guide, the target repository will have:

- GitHub issues that act as trusted task contracts;
- pull requests that act as durable state anchors;
- a machine-readable plan bound to the task, base commit, scope, risk, checks,
  evidence, rollback, and escalation;
- read-only planning and review roles plus a task-scoped implementation role;
- deterministic `low`, `medium`, `high`, and `critical` risk routing;
- pre-action tool authorization and commit-level scope validation;
- independent quality, acceptance, dependency, security, merge, governance,
  and review checks;
- commit-bound evidence and a fan-in execution report;
- bounded recovery and explicit stop conditions;
- optional MCP and Continuous AI capabilities;
- hosted rules, environments, and trusted identities that can produce
  `ready_for_acceptance`.

Local validation can produce `ready_for_review`. Only live GitHub evidence can
produce `ready_for_acceptance`.

## 1. Choose the installation boundary

The system has two distinct parts.

| Part | Examples | Stored where |
| --- | --- | --- |
| Source-controlled control plane | Instructions, task template, agents, hooks, policy, scripts, workflows, tests | Target repository |
| Hosted acceptance plane | Rulesets, required checks, CODEOWNERS enforcement, environments, GitHub Apps, secrets, variables, MCP registry | GitHub settings |

Installing repository files does not enable the hosted controls. Treat hosted
configuration as a separate installation phase with separate evidence.

The reference uses Node.js 22 for control-plane scripts even though the
application itself could use any language. Keeping the governance toolkit in
JavaScript makes it usable from GitHub Actions without coupling it to the
application runtime.

## 2. Prepare a controlled bootstrap

The first installation cannot be approved by controls that do not exist yet.
Treat it as a high-risk bootstrap change with explicit human ownership.

1. Clone the target repository and this repository as siblings.
2. Create a dedicated bootstrap branch from the current default branch.
3. Record the exact starting commit.
4. Name the human owner who may install repository settings.
5. Require an independent review before the bootstrap reaches the default
   branch.
6. Keep the native hook outside `.github/hooks/` until Step 16.

Example:

```powershell
gh repo clone <owner>/<project>
gh repo clone webmaxru/ai-engineering-system
Set-Location <project>
git switch -c bootstrap/ai-engineering-system
git rev-parse HEAD
```

Use a staging directory that GitHub and Copilot do not activate:

```text
.ai-engineering-bootstrap/
```

Do not use the bootstrap directory as durable configuration. It exists only to
prepare and test the final files.

Add it to the local repository exclude file so it cannot be committed by
accident:

```powershell
$excludeFile = git rev-parse --git-path info/exclude
Add-Content $excludeFile ".ai-engineering-bootstrap/"
```

## 3. Complete the project worksheet

Define these values before copying implementation files.

| Decision | Example | Why it matters |
| --- | --- | --- |
| Default branch | `main` | Plans, merge checks, trusted workflows, and environments bind to it |
| Application paths | `src/**`, `tests/**` | Establish normal implementation scope |
| High-risk paths | `.github/**`, `infra/**`, `migrations/**` | Establish deterministic risk floors |
| Prohibited paths | generated clients, public schemas, production manifests | Prevent accidental expansion |
| Quality command | `npm run validate`, `make check`, `dotnet test` | Produces the normal engineering evidence |
| Focused test command | project-specific | Proves the changed behavior quickly |
| Acceptance command | project-specific | Proves process, persistence, network, queue, or deployment boundaries |
| Build command | project-specific | Proves a deployable artifact can be produced |
| Dependency gate | ecosystem and GitHub plan specific | Prevents vulnerable supply-chain changes |
| Security gate | CodeQL languages, secret scanning, project scanners | Defines security evidence |
| Production environment | `production` or another exact name | Defines critical authorization |
| Control-plane owners | team or users | Own agents, hooks, workflows, and policy |
| Evidence retention | at least 90 days | Preserves auditability |

Also identify one application invariant that unit tests alone cannot prove. Good
examples include:

- idempotency across two service instances;
- a database migration against the supported database;
- a queue producer and consumer running in separate processes;
- an authorization decision against a real policy engine;
- a deployment smoke test behind the actual ingress layer.

This invariant becomes the acceptance evidence that proves the installation is
more than a set of repository files.

## 4. Establish application architecture and authority

Before adding agents, ensure the target repository has:

- an architecture document describing runtime and durability boundaries;
- ADRs for decisions an agent must not silently reinterpret;
- stable build, test, and acceptance commands;
- a documented rollback path;
- named owners for application, security, infrastructure, and governance
  changes.

The issue is the task contract. Chat history, a branch name, an offline fixture,
or an agent's interpretation must never authorize writes.

Copy and adapt:

```text
templates/northstar/.github/ISSUE_TEMPLATE/agent-task.yml
```

Preserve these task-contract fields:

- task ID;
- goal;
- authoritative sources;
- allowed scope;
- prohibited scope;
- constraints;
- non-goals;
- validation expectations;
- rollout expectations;
- outputs;
- success criteria;
- stop conditions.

Each success criterion uses:

```text
ID | observable statement | stable proving test
```

The proving test must be the stable leaf test name or check identifier, not a
free-form claim such as "tests pass".

Customize the examples, labels, and default paths for the project. If field
headings change, update and test `scripts/task-contract.mjs`, because the parser
depends on the contract shape.

Create offline fixtures only for parser and demo tests. They must remain
explicitly non-authoritative.

## 5. Install repository instructions

Start from:

```text
templates/northstar/AGENTS.snapshot.md
```

Copy it to the target repository as `AGENTS.md`, then replace Northstar-specific
application constraints with the target project's durable rules.

The instructions should define:

1. what must be read before work starts;
2. where the task contract lives;
3. how plans are approved;
4. the risk model;
5. role and capability boundaries;
6. what may and may not be written or logged;
7. required local and hosted evidence;
8. recovery, rollback, and stop conditions;
9. operational review cadence.

Keep these system invariants:

- **plan -> act -> evaluate**;
- **agents propose; humans and policy accept**;
- planning and review are read-only;
- no trusted task means reads are allowed and writes are denied;
- narrative confidence cannot lower deterministic risk;
- missing evidence is failure;
- `ready_for_review` is local;
- `ready_for_acceptance` is hosted;
- validation-authority changes cannot self-certify.

If GitHub surfaces used by the team require
`.github/copilot-instructions.md`, generate it from `AGENTS.md`; do not maintain
two authored copies. Adapt `scripts/sync-agent-instructions.mjs` and add:

```text
instructions:sync
instructions:check
```

Create path-specific instructions only when a path has additional durable
rules. Typical examples:

```text
.github/instructions/workflows.instructions.md
.github/instructions/migrations.instructions.md
.github/instructions/tests.instructions.md
```

Do not restate the entire repository guide in every file.

## 6. Install the control-plane toolkit

The inert reference toolkit is under:

```text
templates/northstar/scripts/
templates/northstar/tests/unit/
templates/northstar/tests/fixtures/
```

Copy it into the bootstrap branch, not directly to the default branch.

For a Node.js project, merge the governance commands into the existing
`package.json`. For a non-Node project, add a small private Node.js control
package at the repository root.

Keeping `scripts/` directly under the repository root is the safest starting
layout. Many reference scripts compute the repository root as the parent of
their own directory. Moving the toolkit requires coordinated changes to every
`REPO_ROOT`, hook command, workflow command, command-allowlist expression,
policy path, and CODEOWNERS entry.

The reference layout assumes:

```json
{
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  }
}
```

Create a lockfile and keep `npm ci` deterministic. The control-plane unit tests
use Vitest; the application can continue using its own language and test
runner.

Add `.nvmrc` with the supported Node major version and ignore generated local
evidence:

```text
artifacts/
incoming-evidence/
incoming-maintenance-evidence/
```

Install or map commands for these capabilities:

| Capability | Reference command |
| --- | --- |
| Fetch trusted issue | `npm run contract:fetch -- --issue <number>` |
| Resolve PR task | `npm run contract:from-pr -- --pr <number>` |
| Show plan proposal | `npm run plan:show` |
| Validate plan | `npm run plan:gate -- --pr <number>` |
| Materialize plan contract | `npm run plan:materialize` |
| Publish plan | `npm run plan:publish -- --file <path>` |
| Resolve approved plan | `npm run plan:approved` |
| Record approval | `npm run plan:record-approval` |
| Check changed paths | `npm run scope:check -- --base <ref>` |
| Check merge compatibility | `npm run merge:check` |
| Check governance | `npm run governance:check` |
| Scan for secrets | `npm run security:secrets` |
| Build evidence | `npm run evidence` |
| Check repair budget | `npm run repair:check` |
| Evaluate a tool request | `npm run hook:check` |

The reference command wiring is:

```json
{
  "scripts": {
    "contract:fetch": "node scripts/fetch-task-contract.mjs",
    "contract:from-pr": "node scripts/resolve-pr-task.mjs",
    "plan:show": "node scripts/publish-plan.mjs --show",
    "plan:gate": "node scripts/check-plan.mjs",
    "plan:materialize": "node scripts/plan-contract.mjs",
    "plan:publish": "node scripts/publish-plan.mjs",
    "plan:approved": "node scripts/fetch-approved-plan.mjs",
    "plan:record-approval": "node scripts/plan-approval.mjs",
    "scope:check": "node scripts/check-scope.mjs",
    "merge:check": "node scripts/check-merge.mjs",
    "instructions:sync": "node scripts/sync-agent-instructions.mjs",
    "instructions:check": "node scripts/sync-agent-instructions.mjs --check",
    "governance:check": "node scripts/governance-audit.mjs --offline",
    "governance:online": "node scripts/governance-audit.mjs --out artifacts/repository-controls-report.json",
    "security:secrets": "node scripts/secret-scan.mjs",
    "evidence": "node scripts/build-execution-report.mjs",
    "repair:check": "node scripts/repair-budget.mjs",
    "hook:check": "node scripts/authorize-tool.mjs"
  }
}
```

If command names change, update the hook allowlist, workflows, instructions,
tests, and documentation together.

Map these project-specific commands:

```text
lint
typecheck or equivalent static analysis
build
test:unit
test:acceptance
validate
validate:all
```

For a Python repository, for example, `validate` may call Ruff, mypy, build,
and pytest. For a .NET repository it may call format verification, build, and
`dotnet test`. The evidence job names remain stable even when the underlying
commands differ.

### Remove reference-specific identifiers

Search every copied file:

```powershell
git grep -n -i "northstar\|WI-1842\|webmaxru"
```

Replace or deliberately retain each occurrence:

- schema namespaces such as `northstar/plan/1`;
- environment variables such as `NORTHSTAR_HEAD_SHA`;
- artifact prefixes such as `northstar-check-*`;
- workflow display names referenced by `workflow_run`;
- workflow filenames dispatched by another workflow;
- database names and service containers;
- task IDs and fixture content;
- owner names, reviewers, and CODEOWNERS entries;
- application paths and acceptance criteria;
- repository descriptions and fictional incidents.

Use a stable project namespace for versioned schemas. Renaming is not enough:
update producers, consumers, fixtures, tests, and workflow artifact patterns
together. Also update structural checks in `scripts/governance-audit.mjs`,
including regular expressions that intentionally bind workflow names,
filenames, environment names, and artifact prefixes.

### Align the source-tree audit with the installed surface

`scripts/governance-audit.mjs` contains explicit `REQUIRED_FILES` and
`STALE_DOC_PATHS` lists. Customize both lists for the target repository.

If MCP or Continuous AI will not be installed, remove their files from
`REQUIRED_FILES` and update the related policy and tests. If the system is
being adopted in stages, the audit must describe the current stage without
claiming uninstalled capabilities.

The final audit should require every control the repository claims to have. It
must not require optional files that were deliberately excluded, and it must
not silently omit required controls.

## 7. Configure risk and plan contracts

Copy and adapt:

```text
templates/northstar/.github/governance/policy.json
templates/northstar/scripts/risk-policy.mjs
templates/northstar/scripts/plan-contract.mjs
templates/northstar/scripts/plan-approval.mjs
templates/northstar/scripts/check-plan.mjs
templates/northstar/scripts/fetch-approved-plan.mjs
```

Keep the four risk levels:

| Risk | Typical target-project examples | Minimum routing |
| --- | --- | --- |
| `low` | Documentation and formatting | Automated checks; reversible |
| `medium` | Application code, dependencies, bounded refactors | Pull request, objective checks, current human review |
| `high` | Workflows, hooks, agents, security, infrastructure, migrations, validation code | Plan-only approval, CODEOWNERS, stronger checks |
| `critical` | Production deployment or production-secret access | Protected environment and explicit reviewers |

Customize `pathRisk` to the repository. At minimum, treat these as high risk:

```text
.github/workflows/**
.github/hooks/**
.github/agents/**
.github/instructions/**
.github/governance/**
scripts or the chosen control-tool directory
infrastructure and deployment definitions
security policy
database migrations
dependency manifests and lockfiles used by validation
test, build, lint, and typecheck configuration
```

The plan contract must bind:

- task ID and authoritative contract digest;
- default branch and full base SHA;
- allowed and prohibited paths;
- risk and risk reasons;
- implementation steps;
- success-criterion-to-test mappings;
- required checks and evidence;
- decisions and handoffs;
- risks;
- rollback and escalation.

For high and critical work, use a plan-only pull request. A valid approval must
bind the task digest, plan digest, base SHA, reviewed plan commit, reviewer,
review ID, and timestamp. Editing the plan invalidates the approval.

Implementation occurs on a separate branch created from the approved base:

```text
agent/implement/<task-id-lowercase>
```

Do not implement on the plan branch.

## 8. Configure roles and prompts

Copy and adapt:

```text
templates/northstar/.github/agents/
templates/northstar/.github/prompts/
templates/northstar/.github/pull_request_template.md
```

Keep the capability split:

| Role | Required capability |
| --- | --- |
| Planner | Read and search only; creates a local plan proposal |
| Implementer | Writes only inside approved task and plan scope |
| Dependency agent | Changes only manifests and lockfiles |
| Security reviewer | Read-only security analysis |
| Risk reviewer | Read-only diff and evidence review |

Remove tools that a role does not need. Do not give edit tools to the planner
or reviewers for convenience.

The planner should persist a local proposal. Publication is a human safe output:

```powershell
npm run plan:publish -- --file artifacts/plan-proposal.md
```

The implementer must resolve the trusted issue and approved plan in a fresh
session. Do not transfer hidden conversation state between roles.

## 9. Test tool authorization before activation

Copy and adapt:

```text
templates/northstar/scripts/authorize-tool.mjs
templates/northstar/scripts/resolve-task.mjs
templates/northstar/scripts/session-start.mjs
templates/northstar/scripts/audit-hook.mjs
templates/northstar/scripts/agent-stop.mjs
templates/northstar/scripts/plan-stop.mjs
templates/northstar/.github/hooks/agent-boundary.json
```

Keep the hook JSON in the bootstrap staging directory for now.

Custom agent files may also declare role-specific lifecycle commands in their
frontmatter. Those commands become active with the agent definition; the
deferred activation described here applies specifically to the repository-wide
`.github/hooks/agent-boundary.json`.

### Customize the command allowlist

`authorize-tool.mjs` uses exact regular expressions. Replace Northstar's npm
commands with the target project's safe validation commands.

Allow only:

- contract and plan resolution;
- read-only Git inspection;
- focused tests;
- deterministic validation;
- controlled local service startup and shutdown when required.

Continue to deny:

- shell chaining, redirection, interpolation, and pipelines;
- environment enumeration;
- arbitrary network calls;
- secret access or publication;
- destructive Git and filesystem operations;
- direct publication or merge;
- commands not required by the active task.

If the project needs a new command, add one exact pattern and a focused unit
test. Do not add a generic shell wildcard.

### Customize path extraction

Test every tool shape used by the team's Copilot surfaces:

- direct file edit;
- multi-file edit;
- patch application;
- shell command;
- test runner;
- IDE-specific tool names.

The hook must evaluate the requested capability and actual paths, not only the
tool's display name.

### Run negative tests

Before activation, invoke the policy directly and prove:

1. reads are allowed without a task;
2. writes are denied without trusted issue authority;
3. writes are denied on the wrong branch;
4. writes are denied when the branch does not descend from the approved base;
5. issue scope is enforced;
6. narrower plan scope is enforced;
7. prohibited scope beats allowed scope;
8. shell metacharacters are denied;
9. environment and secret enumeration are denied;
10. publication and destructive commands are denied;
11. the exact validation allowlist is allowed only with the required
    authority.

Also verify that hook audit records contain attribution and hashes but not raw
prompts, commands, request payloads, credentials, or secrets.

Do not add a bypass environment variable. If a broken hook must be recovered,
an accountable human can revert the bootstrap commit from a normal terminal.

## 10. Build evaluation and evidence

Copy and adapt:

```text
templates/northstar/.github/workflows/governed-change.yml
templates/northstar/.github/workflows/publish-evidence.yml
templates/northstar/.github/workflows/plan-gate.yml
templates/northstar/.github/workflows/production-gate.yml
templates/northstar/.github/workflows/governance-review.yml
templates/northstar/.github/workflows/copilot-setup-steps.yml
templates/northstar/scripts/evidence-record.mjs
templates/northstar/scripts/import-evidence-artifacts.mjs
templates/northstar/scripts/import-workflow-results.mjs
templates/northstar/scripts/build-execution-report.mjs
templates/northstar/scripts/publish-evidence.mjs
templates/northstar/scripts/publish-acceptance-status.mjs
```

The governed workflow should fan out independent jobs:

| Stable evidence ID | Target-project adaptation |
| --- | --- |
| `plan-contract` | Resolve the issue and validate the current plan |
| `plan-approval` | Resolve the digest-bound approval when risk requires it |
| `scope-policy` | Check the full diff, including both sides of renames |
| `quality` | Run instructions, lint/static analysis, build, and unit tests |
| `acceptance` | Run the real cross-boundary application proof |
| `dependency-review` | Use the ecosystem and GitHub-plan-appropriate dependency gate |
| `secret-scan` | Run GitHub secret controls plus a deterministic supplemental scan |
| `codeql` | Configure the actual project languages |
| `merge-validation` | Test the immutable head against the current base |
| `governance-policy` | Validate source-controlled controls |
| `repository-controls` | Verify rules, environments, identities, and secret locations |
| `human-review` | Require current approval of the latest head |
| `evidence` | Build the final execution report |

Every producer emits an evidence envelope bound to:

- repository;
- workflow and job;
- run ID and attempt;
- actor;
- pull request;
- base SHA;
- head SHA;
- status;
- artifact digest.

The fan-in must reject missing, failed, skipped, duplicate, stale, cross-run, or
cross-commit evidence.

Supporting workflows have separate responsibilities:

| Workflow | Responsibility |
| --- | --- |
| `plan-gate.yml` | Validate the plan-only pull request without publishing approval |
| `production-gate.yml` | Demonstrate the protected production-environment boundary for critical work |
| `governance-review.yml` | Recheck live repository controls on a schedule |
| `copilot-setup-steps.yml` | Install and verify the cloud agent toolchain before a task starts |

### Adapt application setup

Replace Northstar's Node and PostgreSQL setup with the target project's actual
requirements:

- language and package manager setup;
- caches;
- service containers;
- environment variables;
- migrations;
- JUnit or equivalent machine-readable test output;
- build artifacts;
- acceptance infrastructure.

Keep workflow permissions read-only by default and elevate only on the job that
needs the permission.

### Preserve the trusted publisher boundary

The pull-request workflow evaluates untrusted change content. The
`workflow_run` publisher executes default-branch code and must never check out
or execute the pull-request branch in its write-capable job.

It re-resolves the immutable pull request and commit, imports only allowlisted
evidence, and publishes one stable `trusted-acceptance` status.

The trusted publisher, not the pull-request workflow, produces
`validation-authority` evidence. Default-branch code detects whether the pull
request changes the code or configuration that decides what evidence is
accepted. A pull-request-controlled job must not compute or override this
verdict.

Use concurrency groups so stale runs do not race the current change. Retain
evidence for at least the policy duration.

## 11. Finalize the native hook configuration

Review the final hook command paths and timeouts after:

- task and plan parsers pass;
- risk and scope tests pass;
- command and path policy tests pass;
- instructions are synchronized;
- focused quality and acceptance commands pass;
- workflows parse and static analysis passes;
- a human has reviewed the bootstrap configuration.

Keep the tested configuration in the bootstrap staging directory until the
final validation in Step 16. Confirm that its eventual destination will be:

```text
.github/hooks/agent-boundary.json
```

The native hook is defense in depth. GitHub Actions and hosted policy remain the
durable acceptance authority.

The final `governance:check` may still report the intentionally absent
`.github/hooks/agent-boundary.json` until Step 16. Do not weaken the audit or
add a bypass to hide that expected bootstrap state.

## 12. Configure GitHub-hosted controls

Repository administrators perform this phase in GitHub.

### CODEOWNERS

Create or update `.github/CODEOWNERS` so high-risk paths have accountable
owners:

```text
/.github/agents/       @<owner-or-team>
/.github/hooks/        @<owner-or-team>
/.github/workflows/    @<owner-or-team>
/.github/governance/   @<owner-or-team>
/scripts/              @<owner-or-team>
/infra/                @<platform-team>
/security/             @<security-team>
```

Match these entries to the ownership and reviewer names in governance policy.

### Default-branch ruleset

Prepare a default-branch ruleset that will:

- require pull requests;
- require the stable status checks defined by policy;
- require branches to be up to date;
- require current approvals;
- dismiss stale approvals;
- require CODEOWNERS review for high-risk paths;
- block direct pushes, force pushes, and deletion;
- deny unreviewed bypasses.

The required status list should use stable job or status names, including
`trusted-acceptance`, rather than ephemeral workflow run names.

Do not require `trusted-acceptance` before its trusted publisher workflow exists
on the default branch. Doing so can deadlock the bootstrap. Prepare the ruleset
and activate its new required checks immediately after the audited bootstrap
merge in Step 17. If GitHub supports an evaluation or disabled state for the
ruleset, use it during bootstrap.

### Security controls

Enable and verify, subject to the GitHub plan:

- dependency review;
- CodeQL/default setup or the repository workflow;
- secret scanning;
- push protection;
- appropriate security alert access.

If a control is unavailable on the current plan, record it as
`not-verified` or `unavailable`. Do not replace it with a success-shaped local
file.

### Protected environments

Create:

- `production` for critical deployment authorization;
- `trusted-publisher` for default-branch evidence publication;
- `system-maintenance` for changes to validation authority.

Restrict privileged environments to the exact default branch, disable
administrator bypass, name exact reviewers, and prevent self-review.

### Trusted identities

The full reference uses two distinct GitHub Apps:

1. **Trusted publisher**
   - reads actions, contents, administration, environment, and secret metadata;
   - writes pull requests/issues as needed and commit statuses;
   - does not dispatch workflows.
2. **Maintenance dispatcher**
   - has Actions write only;
   - dispatches the protected maintenance workflow;
   - cannot publish acceptance.

Configure repository variables:

```text
TRUSTED_PUBLISHER_APP_ID
TRUSTED_PUBLISHER_APP_LOGIN
SYSTEM_MAINTENANCE_DISPATCH_APP_ID
SYSTEM_MAINTENANCE_DISPATCH_APP_LOGIN
```

Configure private keys only as the exact protected-environment secrets expected
by policy:

| Environment | Exact private-key secrets |
| --- | --- |
| `trusted-publisher` | `TRUSTED_PUBLISHER_APP_PRIVATE_KEY`, `SYSTEM_MAINTENANCE_DISPATCH_APP_PRIVATE_KEY` |
| `system-maintenance` | `TRUSTED_PUBLISHER_APP_PRIVATE_KEY` only |

Do not duplicate those private keys as repository or organization Actions
secrets, and do not place them in any other environment. The dispatch key is
not available in `system-maintenance`; the publisher key is scoped separately
to both privileged environments. Neither App identity may be an environment
reviewer.

Bind the required `trusted-acceptance` context to the trusted-publisher App
integration ID.

## 13. Protect validation-authority changes

Define the paths that can change what counts as evidence:

```text
.github/workflows/**
.github/governance/**
.github/hooks/**
.github/agents/**
.github/instructions/**
control-plane scripts
dependency manifests and lockfiles
lint, typecheck, build, and test configuration
```

Edit the literal `AUTHORITY_PATHS` list in
`scripts/check-validation-authority.mjs`. It is not derived from governance
policy. Keep it synchronized with `pathRisk` and include the target ecosystem's
real manifests and configuration, such as `pyproject.toml`, `pom.xml`,
`build.gradle`, solution/project files, or custom test configuration.

A pull request that changes these paths must initially fail
`validation-authority`. It may reach `ready_for_review`, but not
`ready_for_acceptance`.

Copy and adapt:

```text
templates/northstar/.github/workflows/system-maintenance-approval.yml
templates/northstar/scripts/check-validation-authority.mjs
templates/northstar/scripts/maintenance-manifest.mjs
templates/northstar/scripts/verify-maintenance-runs.mjs
```

After the protected `system-maintenance` environment is approved, trusted
default-branch code revalidates the same immutable SHA, refreshes mutable
GitHub state, verifies the restricted evidence bundle, and may replace the
failed acceptance status.

The first installation requires one explicit audited owner action because the
default-branch maintenance workflow cannot govern itself before it exists.
Document that bootstrap. Do not turn it into a reusable bypass.

## 14. Configure MCP deliberately

MCP servers expand the agent's external capability boundary.

For each server:

1. approve it through the organization or enterprise registry;
2. list exact tool names rather than `*`;
3. provide runtime credentials through protected `COPILOT_MCP_*` variables;
4. document the data and mutation boundary;
5. classify adding a server or widening tools as high risk;
6. test unavailable and denied behavior.

The reference `mcp.json` exposes only named GitHub Agentic Workflow tools. It
does not prove that organization registry or allowlist settings are enabled.

## 15. Add Continuous AI only after deterministic CI

Continuous AI is optional. Install it after the deterministic control loop is
working.

Start from:

```text
templates/northstar/.github/workflows/daily-repository-status.md
```

Customize:

- trigger and schedule;
- read-only tools;
- network allowlist;
- AI budget;
- safe output;
- repository-specific prompt.

Use staged safe output first. Compile the Markdown source into a generated
workflow, pin the compiler/action version, and run workflow security scanners.

An agentic workflow may analyze and propose. It must not decide whether a
change is accepted.

## 16. Validate the bootstrap before merge

The bootstrap evidence should include all of the following.

### Activate the hook for final validation

Move the tested hook into its final location:

```text
.github/hooks/agent-boundary.json
```

Start a fresh Copilot session and repeat the negative tests through the actual
host. Confirm that a read works and an uncontracted write is denied.

From this point, use an accountable human terminal for bootstrap Git operations.
Do not add a temporary bypass to make the remaining work easier.

### Source-controlled checks

- task contract parser tests;
- plan schema and digest tests;
- risk-floor tests for every sensitive path;
- approval binding and invalidation tests;
- path extraction and rename-scope tests;
- hook allow and deny tests;
- evidence missing/stale/cross-run/cross-commit rejection tests;
- recovery budget tests;
- instruction synchronization;
- workflow static analysis;
- secret and dependency scans;
- the project's complete quality command;
- the real acceptance test.

### Post-merge hosted verification plan

Some hosted controls depend on trusted workflows already existing on the
default branch. Define a canary pull request that will be opened immediately
after Step 17 and prove:

- missing plan evidence fails;
- required approval of an old head fails;
- a prohibited path fails;
- an unapproved high-risk plan fails;
- a validation-authority change cannot self-certify;
- a publisher identity mismatch fails;
- a secret in the wrong scope fails the governance audit;
- a missing required status prevents merge.

Do not report these checks as passed before that canary run exists.

### Evidence statement

Record separately:

```text
Local result: ready_for_review
Hosted result: ready_for_acceptance | not-verified | failed
```

Never infer the hosted result from a local command.

## 17. Merge and verify the bootstrap

Before merging:

1. obtain independent review of the bootstrap diff;
2. confirm every copied Northstar identifier was adapted or intentionally
   retained;
3. confirm the hook is active only in its final path;
4. confirm all required status names match policy and rulesets;
5. confirm environment reviewers and App identities are distinct;
6. confirm private keys exist only in approved environments;
7. record local evidence and the hosted bootstrap status
   (`not-verified` until post-merge verification);
8. preserve a revert commit or rollback branch.

Merge through the audited owner action established in Step 2. After the
bootstrap reaches the default branch:

1. activate the prepared default-branch ruleset and required checks;
2. verify CODEOWNERS, security settings, environments, variables, App
   installations, and secret locations;
3. open the canary pull request defined in Step 16;
4. let the governed workflow and trusted default-branch publisher run;
5. execute every positive and negative hosted check;
6. record the exact workflow runs and commit statuses;
7. revert or leave hosted acceptance `not-verified` if any control cannot be
   proven.

After this verification, subsequent system changes use the normal high-risk
maintenance path.

## 18. Run the first governed task

1. Create an issue from the new **Agent task** template.
2. Complete every contract section with project-specific paths and tests.
3. Run:

   ```powershell
   npm run contract:fetch -- --issue <issue>
   ```

4. Start the read-only planner with `/plan <issue>`.
5. Inspect `artifacts/plan-proposal.md` and `artifacts/plan.json`.
6. Publish the plan-only pull request:

   ```powershell
   npm run plan:publish -- --file artifacts/plan-proposal.md
   ```

7. For high or critical work, have a human approve the plan-only commit and
   record the exact review:

   ```powershell
   $review = gh api repos/{owner}/{repo}/pulls/<plan-pr>/reviews `
     --jq '[.[] | select(.state == "APPROVED")][-1].id'
   npm run plan:record-approval -- --pr <plan-pr> --review $review
   ```

8. Create the implementation branch from the approved base:

   ```powershell
   git switch -c agent/implement/<task-id-lowercase> <approved-base-sha>
   ```

9. Start a fresh session with `/implement <issue>`.
10. Run focused validation while implementing.
11. Open the implementation pull request and let the governed workflow produce
    evidence.
12. Use read-only risk/security review.
13. Have humans and platform policy accept, reject, or request changes.

## 19. Adopt in stages when necessary

The full system can be introduced incrementally.

| Stage | Install | Do not claim yet |
| --- | --- | --- |
| 1. Contracts | Task template, architecture, instructions, PR template | Tool enforcement or trusted evidence |
| 2. Roles and plans | Planner, implementer, plan contract, risk policy | Hosted acceptance |
| 3. Local enforcement | Scope checks, tested native hook, recovery policy | Complete mediation or security certification |
| 4. CI evidence | Fan-out jobs, evidence envelopes, execution report | Hosted repository controls unless verified |
| 5. Hosted acceptance | Ruleset, CODEOWNERS, environments, trusted Apps | Production authorization until exercised |
| 6. Continuous AI | Bounded read-only agentic workflow and staged safe output | Autonomous acceptance |

At every stage, document the installed capability and the unimplemented
boundary. Do not use the final system terminology to overstate a partial
installation.

## 20. Common failure modes

### Copying before understanding

Northstar paths, schemas, owners, database services, and commands are examples.
A literal copy can create false evidence or block the project.

### Activating hooks first

An uncustomized command or path policy can block the work needed to finish the
installation. Test it directly, install it last, and retain human Git recovery.

### Treating prompts as enforcement

Instructions communicate intent. Hooks, CI, rulesets, environments, and
identity boundaries provide independent controls.

### Treating a green unit suite as acceptance

If the success criterion crosses a process or service boundary, run the real
boundary. Do not replace it with mocks.

### Letting the pull request publish its own acceptance

Write-capable publication must execute trusted default-branch code and
revalidate immutable evidence.

### Using one privileged identity for everything

Separate publication, dispatch, and human review. A single identity collapses
the intended trust boundaries.

### Retrying policy or security failures

Authority and security findings are not transient. Escalate rather than
prompting or retrying around them.

## Completion checklist

- [ ] The task contract reflects the target project.
- [ ] Architecture and ADRs identify real runtime boundaries.
- [ ] `AGENTS.md` and generated compatibility instructions agree.
- [ ] Agents have role-specific least-privilege tools.
- [ ] Risk floors cover every sensitive path and operation.
- [ ] Plans bind task digest, base SHA, scope, risk, checks, and rollback.
- [ ] High-risk plan approval is digest- and commit-bound.
- [ ] Tool authorization has focused positive and negative tests.
- [ ] The hook was activated only after those tests passed.
- [ ] The complete diff, including renames, is scope checked.
- [ ] Quality and real acceptance commands pass.
- [ ] Evidence rejects missing, stale, skipped, duplicate, and mismatched
      producers.
- [ ] Pull-request code cannot publish its own trusted acceptance.
- [ ] CODEOWNERS, rulesets, security controls, and retention are verified live.
- [ ] Production, trusted-publisher, and system-maintenance environments are
      configured.
- [ ] Publisher, dispatcher, and human reviewer identities are distinct.
- [ ] Privileged private keys exist only in approved environments.
- [ ] MCP uses approved servers and named tools.
- [ ] Continuous AI, if enabled, uses bounded read-only tools and staged safe
      output.
- [ ] The bootstrap and rollback are documented.
- [ ] The first live task reaches the expected local and hosted decision.
