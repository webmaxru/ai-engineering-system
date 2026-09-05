# Architecture

## Architectural authority

The architecture in this document is an application of
[`Developing-in-Agentic-AI-Systems-Learning-Paths.md`](Developing-in-Agentic-AI-Systems-Learning-Paths.md).
That guide is non-negotiable. The complete requirement mapping is in
[`GUIDE-CONFORMANCE.md`](GUIDE-CONFORMANCE.md); implementation choices that
fill guide gaps are isolated in
[`TECHNICAL-EXTENSIONS.md`](TECHNICAL-EXTENSIONS.md).

This document defines the target architecture. It is not a release certificate.
The current executable-reference decision is in
[`GUIDE-CONFORMANCE.md`](GUIDE-CONFORMANCE.md), and a blocked architecture lock
must prevent adoption even when the conceptual design below is unchanged.

## System model

The AI engineering system coordinates people, agents, repositories, tools, and
platform policy around one control loop:

```text
task contract -> plan -> approval -> act -> evaluate -> accept or repair
      ^                                                   |
      +---------------- external memory ------------------+
```

Its responsibility boundary is:

> Agents propose; humans and policy accept.

The system is not an autonomous developer. GitHub is the system of record and
control plane. Agent contributions are evaluated through the contributor
model: the work is judged by intent, scope, evidence, ownership, policy, and
fallback, not by whether the author was human or an agent. Agent capabilities
are explicit, evidence is machine-verifiable, and acceptance remains
independent from implementation.

## Architecture layers

```mermaid
flowchart TB
  T[Issue task contract] --> P[Read-only planning]
  P --> PC[Machine-readable plan contract]
  PC --> R[Deterministic risk routing]
  R --> A[Required human plan approval]
  A --> I[Scoped implementation]

  I --> PR[Pull request state anchor]
  PR --> Q[Quality, build, and unit evidence]
  PR --> X[Application acceptance evidence]
  PR --> S[Security and dependency evidence]
  PR --> G[Scope, merge, and governance evidence]
  PR --> H[Current human review]

  Q --> E[Commit-bound evidence fan-in]
  X --> E
  S --> E
  G --> E
  H --> E

  E --> RR[ready_for_review]
  E --> RA[ready_for_acceptance]
  E --> F[Repair or escalate]
```

### Contract layer

The task contract is the source of authority. It includes:

- goal and authoritative sources;
- allowed and prohibited scope;
- constraints and non-goals;
- required outputs;
- observable success criteria;
- validation and rollout expectations;
- stop conditions.

The contract is fetched from a trusted live issue and digested. Fixtures may
exercise parsers and demos but cannot authorize real writes.

### Planning layer

Planning is read-only. The plan contract binds:

- task identity and task-contract digest;
- base branch and full base SHA;
- allowed and prohibited paths;
- risk level and risk reasons;
- ordered steps and success-criterion mappings;
- required checks and evidence;
- decisions, handoffs, rollback, and escalation.

The guide permits a **plan-first workflow** and a **plan + execution
workflow**. Northstar uses plan-first for high and critical work and may use
plan + execution for lower-risk work when policy allows it. The plan-first
approval record binds the contract digest, plan digest, base SHA, plan commit,
reviewer, review ID, and timestamp
([EXT-001](TECHNICAL-EXTENSIONS.md#ext-001---versioned-contracts-and-digest-binding),
[EXT-003](TECHNICAL-EXTENSIONS.md#ext-003---plan-publication-and-branch-topology)).

### Capability layer

Each role receives only the tools needed for its phase:

- planner: read and search;
- implementer: scoped edits and allowlisted validation;
- dependency agent: dependency manifests and lockfiles;
- security reviewer: read-only security analysis;
- risk reviewer: read-only diff and evidence review.

Native lifecycle hooks provide pre-action defense in depth. Commit-level scope
checks then evaluate the complete diff, including renames. Workflow permissions,
protected environments, GitHub Apps, and repository rules independently
constrain hosted actions.

### Evaluation layer

Evaluation fans independent checks out and evidence back in:

1. task and plan contract validity;
2. plan approval;
3. changed-path scope;
4. instruction synchronization, lint, typecheck, build, and unit tests;
5. application acceptance tests;
6. dependency audit;
7. secret scanning and CodeQL;
8. merge compatibility;
9. governance policy;
10. current human review.

Each producer emits a commit-bound evidence envelope. The execution report
rejects missing, failed, skipped, duplicate, stale, cross-run, or cross-commit
evidence
([EXT-006](TECHNICAL-EXTENSIONS.md#ext-006---evidence-envelopes-and-readiness-decisions)).

### Acceptance layer

`ready_for_review` means the local reference evidence is complete.
`ready_for_acceptance` additionally requires live hosted evidence:

- the current immutable head commit;
- required workflow checks;
- current human approval;
- CODEOWNERS and branch/ruleset enforcement;
- required protected-environment approvals;
- the stable trusted-publisher status.

Repository configuration files can describe these controls but cannot prove
they are enabled.

### Recovery layer

Failures are classified as reasoning error, tool misuse, context issue,
conflict, policy failure, security failure, transient environment failure, or
unknown. Automated repair stops on repeated signatures, policy/security
failures, unknown failures, or an exhausted attempt budget.

## GitHub as the system of record and control plane

GitHub is the **system of record** because it stores the issues, pull requests,
commits, reviews, workflow runs, logs, and artifacts through which work is
proposed and evaluated. GitHub is the **control plane** because required
checks, CODEOWNERS, rulesets or branch protection, protected environments,
permissions, and security signals enforce what may be accepted.

### External memory and source of truth

Those durable GitHub artifacts are the system's external memory. Each kind of
state has one declared source of truth so agents can reload it without relying
on transient conversation context.

| Artifact | Durable responsibility |
| --- | --- |
| Issue | Requirements, authority, scope, and success criteria |
| Plan pull request | Plan, risk, decisions, handoffs, and rollback |
| Implementation branch and commits | Isolated action history |
| Implementation pull request | State anchor for code and evidence |
| Workflow runs and artifacts | Objective evaluation |
| Reviews | Human plan and implementation decisions |
| Environment events | Critical authorization |

Agents reload this state on resume. Conversation history and hidden reasoning
are not authoritative sources of truth.

## Technology mapping

### Guide-defined technologies

The reference implementation uses the guide's named GitHub technologies:

- GitHub Issues, branches, pull requests, reviews, CODEOWNERS, rulesets, and
  protected environments;
- GitHub Copilot custom agents, repository instructions, prompt files, and
  native lifecycle hooks;
- GitHub Actions for deterministic fan-out/fan-in evaluation;
- CodeQL, dependency review, secret scanning, push protection, SARIF, workflow
  outputs, and artifacts;
- GitHub Agentic Workflows for bounded Continuous AI;
- GitHub MCP servers, registries, and MCP allow lists;
- `GITHUB_TOKEN` and GitHub App tokens with explicit workflow and job
  permissions;
- workflow triggers, concurrency, and protected deployment approvals.

Equivalent technologies are acceptable only when they preserve the same
contracts, capability boundaries, evidence, and acceptance semantics.

### Gap-filling reference technologies

Northstar also uses documented extensions: versioned JSON and digests,
deterministic risk floors, evidence envelopes, a trusted publisher with split
GitHub App identities, supplemental scanners, Node.js/Vitest control tooling,
and a PostgreSQL cross-instance proving workload. These mechanisms and their
rollback boundaries are defined in
[`TECHNICAL-EXTENSIONS.md`](TECHNICAL-EXTENSIONS.md); they are not silently
presented as guide requirements.

## Self-modifying control plane

Validation code cannot safely approve a change to itself. A control-plane
change therefore follows two boundaries:

1. the pull-request-controlled workflow records
   `validation-authority: fail`;
2. a default-branch workflow, protected environment, independent human
   reviewer, and separately scoped trusted identity revalidate the immutable
   commit before publishing acceptance.

The first installation of that mechanism is an explicit audited bootstrap. It
does not create a reusable bypass.

The specification repository avoids this circularity entirely: it has no
active copy of the controls. Changes are proved in Northstar and only then
documented here
([EXT-007](TECHNICAL-EXTENSIONS.md#ext-007---trusted-publication-and-validation-authority-maintenance),
[EXT-013](TECHNICAL-EXTENSIONS.md#ext-013---frameworkreference-repository-separation)).

## Continuous AI

Continuous AI is bounded automation, not unattended authority. The reference
agentic workflow:

- runs from a Markdown source definition;
- has read-only repository access;
- has a bounded AI-credit budget;
- enables only named tools;
- permits only a staged, bounded safe output;
- remains subordinate to deterministic CI and human acceptance.

## MCP boundary

MCP servers are external capabilities. Administrators must:

- approve servers through an organization or enterprise registry;
- enforce the organization or enterprise MCP allow list;
- enable named tools rather than wildcards;
- supply credentials only through protected runtime variables;
- treat new servers or expanded tools as high-risk dependency and policy
  changes;
- verify hosted settings separately from repository configuration.
