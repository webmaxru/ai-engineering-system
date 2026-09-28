# Choose the features your repository needs

Adopt practices on demand, not a twenty-step prerequisite chain. Each group
below can be considered without adopting any other group. Existing repository
CI, ownership, and review can satisfy its prerequisites.

The non-negotiable architecture is
[Developing-in-Agentic-AI-Systems-Learning-Paths.md](Developing-in-Agentic-AI-Systems-Learning-Paths.md):
**plan → act → evaluate**, **agents propose; humans and policy accept**,
GitHub as **system of record and control plane**, the **contributor model**,
and **risk-based autonomy**.

> **Current release: blocked.** Do not copy or activate the Northstar snapshot.
> Its exact audited revision and unresolved defects are recorded in
> [GUIDE-CONFORMANCE.md](GUIDE-CONFORMANCE.md) and
> [AUDIT-2026-09-23.md](AUDIT-2026-09-23.md). This is a feature-selection
> guide, not certification of new installation commands or a claim that
> Northstar's runtime scripts are independently installable.

## Feature menu

| Group | Use it when | Its own prerequisites | Not required |
| --- | --- | --- | --- |
| A. Task contracts and durable context | Requests lose scope or success criteria | A GitHub repository, issue/PR access, accountable owner | Hooks, custom agents, MCP, Continuous AI |
| B. Independent checks and human review | Agent output needs objective evaluation | Existing build/tests, workflow permissions, reviewers, an appropriate GitHub plan | Northstar schemas, hooks, MCP, custom agents |
| C. Read-only planning and review | You want bounded specialist assistance | A supported host, readable repository context, explicit task and tool limits | Write agent, Northstar publisher, MCP, Continuous AI |
| D. MCP capability governance | A task actually needs external tools | Approved server/registry, organization or enterprise MCP allow list, scoped credentials and owner | Northstar hooks, machine plans, Continuous AI |
| E. Bounded Continuous AI | Scheduled or event-driven analysis adds value | GitHub Actions, supported engine/model, approved tools and safe-output policy | Interactive hooks, local agents, MCP unless the workflow uses it |
| F. Integrated Northstar control plane | You need its exact task/plan/tool/evidence protocol | An accepted release, customized policy, runtime, checks, trusted hosted identities and independent approval | Optional MCP or Continuous AI conceptually; current audit still couples their files |

Groups A-E describe guide practices, not a license to claim the **whole**
system conformant after adopting one group. Group F is deliberately a bundle:
its task resolver, plan schema, approval, branch rules, authorizer, evidence,
trusted publisher, and maintenance controls share contracts. Do not disable
checks to pretend that this bundle is modular.

## A. Task contracts and durable context

**Deliverable:** an issue naming inputs, outputs, allowed/prohibited scope,
constraints, observable success criteria, evidence, non-goals, rollback, and
stop conditions; a PR linking decisions and evidence.

**Customize:** application/test paths, owners, commands, data boundaries, and
the success criteria for the actual task. Keep examples fictional and never
make a test fixture authoritative. Study the Northstar task template without
activating its parser.

**Prove it:** another contributor can determine what is allowed and how
completion is measured without a chat transcript. **Rollback:** retire the
template while preserving existing issue and PR history.

Guide basis: task-contract and continuity units, lines 553-624 and 3088-3598.

## B. Independent checks and human review

**Deliverable:** deterministic checks appropriate to the application and
independent human review in GitHub. Select either compatible rulesets or
branch-protection controls; the guide does not require both implementations.

**Customize:** check names, runtime/tool versions, owners, environment names,
retention, least-privilege permissions, and deployment policy.

**Prove it:** a failing change cannot meet required checks; a review of an old
head does not accept the current head; live settings match the intended
policy. Repository YAML alone is not this proof. **Rollback:** revert a
specific configuration change through human review, not by bypassing failures.

Guide basis: contributor model and workflow/security units, lines 307-430,
1915-1980, and 3998-4307.

## C. Read-only planning and review

**Deliverable:** narrowly scoped roles that propose plans or findings without
write, shell-mutation, approval, merge, or deployment capabilities.

**Customize:** authoritative context paths, task vocabulary, permitted
read/search tools, handoffs, and escalation owner. Choose plan-first versus
plan + execution according to risk; do not equate low risk with no policy.

**Prove it:** run a benign read and a prohibited-write canary in the exact
host/harness. The Northstar planner currently assumes a cached live contract;
copying that role alone will not create one. See
[COPILOT-SURFACES.md](COPILOT-SURFACES.md).
**Rollback:** remove the role selection, preserving its proposals in the PR.

Guide basis: bounded roles and planning separation, lines 508-533 and 635-867.

## D. MCP capability governance

**Deliverable:** only the server and named tools needed for the task, approved
through the organization's registry and **MCP allow list**.

**Customize:** registry/server identity, named tools, credentials, owner,
network/data boundary, and revocation procedure. Do not copy Northstar's
`gh aw mcp-server` unless that capability is needed.

**Prove it:** an allowed call succeeds; an unapproved server/tool is refused;
no credential appears in repository files or logs. **Rollback:** revoke access
and remove the specific server declaration.

Guide basis: MCP governance, lines 1103-1145 and 1447-1691; Northstar adapter
mechanism: [EXT-014](TECHNICAL-EXTENSIONS.md#ext-014---repository-local-gh-aw-mcp-adapter).

## E. Bounded Continuous AI

**Deliverable:** one narrow workflow expressed as GitHub Agentic Workflow
Markdown, with explicit triggers, tools, permissions, budget, timeout, and
staged safe output. It augments, never replaces, deterministic CI/CD.

**Customize:** engine/model availability, schedule, prompt, budget, approved
tool versions, safe-output type/limit, and escalation owner.

**Prove it:** inspect compiler **and scanner diagnostics**, then a real hosted
run. Exit zero alone is insufficient: the audited Northstar toolchain printed
five Poutine errors, and its examined hosted agent job failed on model
availability. **Rollback:** disable that workflow without changing CI.

Guide basis: Agentic Workflow units, lines 1260-1274 and 2365-2591.

## F. Integrated Northstar control plane

**Not currently installable as an accepted release.** After the blockers are
repaired and independently accepted, use the
[full installation reference](FULL-INSTALLATION.md) for its worksheet,
inert staging, commands, hosting setup, negative tests, and activation order.

Keep hooks inactive until task identity, plan, scope, allowed commands,
branch/base binding, and evidence consumers pass their tests. A fresh
repository bootstrap is human-owned; it is not a bypass for repairing an
already-governed repository.

**Prove it:** exact reference lock; focused and full validation; independent
process tests where needed; host-specific canaries; current hosted acceptance.
Local `ready_for_review` is not hosted `ready_for_acceptance`.
**Rollback:** revert the reviewed bootstrap as a unit, not isolated protocol
files or a renamed hook.

## Choose a demonstration

| Demonstration | Current status |
| --- | --- |
| [WI-1842](END-TO-END-DEMO.md) | Local application and fixture rehearsal plus an actual cloud planner stop; PR #13 and PR #29 are closed historical attempts. Controller PR #18 is reopened but unmerged/unaccepted—not a cloud delivery |
| [Add `GET /orders/:id`](NEW-ENDPOINT-DEMO.md) | Draft PR #19 is rebased onto `17e7a5c`; exact-head review, hosted `human-review`, local validation and PostgreSQL acceptance (12/12) pass, while full Zizmor, hosted repository-controls, and cross-surface proof remain outstanding |

The [technical extensions register](TECHNICAL-EXTENSIONS.md) identifies which
mechanisms are Northstar/framework choices rather than guide requirements.
