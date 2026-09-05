# Maintaining the system

All maintenance is subordinate to
[`Developing-in-Agentic-AI-Systems-Learning-Paths.md`](Developing-in-Agentic-AI-Systems-Learning-Paths.md).
No maintenance path may weaken or bypass that architecture.

## Why this repository is not self-governing

A framework must remain changeable when the current framework version is
incorrect. Installing its own hooks, agents, and acceptance workflows here
would make framework development depend on the behavior being redesigned.

This repository therefore contains no active implementation of the AI
engineering system. Its root `AGENTS.md` states the cross-repository evidence
rule, but it is process guidance rather than an enforcement plane.

The controlled proving ground is
[`webmaxru/northstar-orders-api-demo`](https://github.com/webmaxru/northstar-orders-api-demo).

## Change workflow

### 1. Define the system change

Identify the affected concept, terminology, lifecycle transition, capability,
evidence rule, or hosted control. State whether the change is normative or
only editorial. Cite the controlling guide heading and line range, classify
the decision as guide-defined, choice-based, or gap-filling, and update
`docs/TECHNICAL-EXTENSIONS.md` for every gap-filling mechanism.

### 2. Implement it in Northstar

Use Northstar's active task-contract process. A framework-level change usually
touches agents, hooks, workflows, governance, validation scripts, or manifests
and therefore has a high risk floor.

The Northstar plan must define:

- exact allowed and prohibited paths;
- success criteria and stable tests;
- local and hosted evidence;
- rollout and rollback;
- stop conditions;
- the validation-authority implications.

### 3. Prove the behavior

Run focused tests and the complete reference validation:

```powershell
npm run validate:all
```

If a success criterion crosses process boundaries, include the PostgreSQL
acceptance suite. If it changes hosted policy or validation authority, include
the protected maintenance evidence or explicitly state why hosted integration
remains unverified.

### 4. Update the specification

Update this repository only to describe behavior demonstrated by the reference.
Keep terminology, architecture, quickstarts, and the implementation map
consistent.

### 5. Refresh the inert snapshot

When Northstar control-plane files changed, refresh `templates/northstar/` from
the accepted commit. Preserve the safe `AGENTS.snapshot.md` name, then update
`reference-lock.json` with the exact source SHA and file hashes. Do not mark
architecture conformance as restored while any required Northstar pull request,
hosted workflow proof, or human acceptance remains pending.

The snapshot is for study and comparison. Northstar remains the executable
source of truth.

With both repositories checked out as siblings:

```powershell
pwsh -File tools\verify-architecture.ps1
```

The verifier must fail when `architecture-lock.json` reports a blocked
reference. That is a release stop, not a condition to bypass.

### 6. Bind the evidence

The change description must link:

- exact Northstar commit SHA;
- Northstar branch or pull request;
- focused test names;
- full validation result;
- acceptance result;
- hosted workflow run and status when applicable;
- limitations, rollback, and escalation notes.

## Changing Northstar's own validation authority

Northstar allows planned changes to its control plane, but those changes cannot
self-certify.

The normal path is:

1. create a high-risk task contract;
2. produce and approve a plan-only pull request;
3. implement on a branch from the approved base;
4. run all local gates to reach `ready_for_review`;
5. let the pull-request workflow record
   `validation-authority: fail`;
6. dispatch the default-branch maintenance workflow with a dedicated
   dispatch-only GitHub App;
7. require an independent reviewer on the protected
   `system-maintenance` environment;
8. re-resolve the immutable pull request SHA and allowlisted evidence;
9. audit repository rules, environments, security settings, identities, and
   secret locations;
10. publish the stable `trusted-acceptance` status with a separate
    environment-scoped trusted-publisher GitHub App.

The first installation requires one explicit audited bootstrap because a
default-branch workflow cannot approve itself before it exists. After
installation, that bootstrap is not a reusable bypass.

## Northstar hosted trust configuration

The reference maintenance path expects:

- repository variables `TRUSTED_PUBLISHER_APP_ID`,
  `TRUSTED_PUBLISHER_APP_LOGIN`, `SYSTEM_MAINTENANCE_DISPATCH_APP_ID`, and
  `SYSTEM_MAINTENANCE_DISPATCH_APP_LOGIN`;
- a trusted-publisher GitHub App installed only on Northstar, with the minimum
  administration/environment/secret-metadata read and pull-request/status
  write permissions needed by the audited workflow;
- a distinct dispatch-only GitHub App with Actions write and no publisher
  authority;
- a `trusted-publisher` environment restricted to the default branch, with
  administrator bypass disabled and environment secrets
  `TRUSTED_PUBLISHER_APP_PRIVATE_KEY` and
  `SYSTEM_MAINTENANCE_DISPATCH_APP_PRIVATE_KEY`;
- a `system-maintenance` environment restricted to the default branch, with
  the exact reviewers declared by policy, self-review prevention,
  administrator bypass disabled, and its separately scoped
  `TRUSTED_PUBLISHER_APP_PRIVATE_KEY`;
- branch protection that binds `trusted-acceptance` to the trusted-publisher
  App integration ID and requires the branch to be current with its base.

Neither App may be an environment reviewer, and the Apps must be distinct. Do
not define either private-key name as a repository or organization Actions
secret, or in an environment outside the policy allowlist. If identity,
environment, branch, ruleset, security, variable, or secret-location checks do
not match exactly, repository-control evidence must fail.

The publisher token intentionally lacks workflow-dispatch authority. The
dispatcher token intentionally lacks status-publication authority.

## One-time bootstrap

The first commit that introduces the trusted maintenance workflow cannot be
approved by that workflow because `workflow_run` uses the definition already
present on the default branch.

Install it through one explicit owner action:

1. validate the installation commit with the complete local evidence bundle;
2. obtain independent platform-owner review;
3. install both Apps and configure variables, environments, branch rules, and
   secret locations exactly as specified;
4. merge or push the installation through an audited owner action;
5. verify the default-branch workflow and a real `trusted-acceptance` status;
6. use the protected maintenance path for all later validation-authority
   changes.

Do not implement a bypass flag, bypass environment variable, or routine
renaming of hooks as a maintenance mechanism.

## Editorial exception

A spelling, formatting, or broken-link repair may be made directly in this
repository when it does not change normative meaning or a claimed behavior.
If a reasonable reader could implement the system differently because of the
edit, treat it as a system change and prove it in Northstar.

## Release checklist

- Every normative decision cites the non-negotiable learning guide.
- `docs/GUIDE-CONFORMANCE.md` reflects the audited guide and Northstar commit.
- Every non-guide mechanism has a current technical-extension entry.
- The machine-readable extension coverage exactly matches the extension
  register and every evidence path exists.
- `architecture-lock.json` says `conformant`, the audited Northstar revision
  says `accepted`, and no blocking reference change remains.
- `pwsh -File tools\verify-architecture.ps1` passes.
- Canonical terms are unchanged or intentionally versioned.
- The architecture and quickstart agree.
- Northstar contains the executable behavior.
- Focused tests prove the new behavior.
- `npm run validate:all` passes in Northstar.
- Cross-instance acceptance passes when relevant.
- Hosted evidence is linked or explicitly unverified.
- The inert Northstar snapshot and `reference-lock.json` match the validated
  source commit when control-plane files changed.
- No active system hooks, agents, or workflows were added here.
