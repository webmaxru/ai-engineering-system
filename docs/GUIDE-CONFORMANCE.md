# Guide conformance

This document records the strict architecture audit of the AI engineering
system against
[`Developing-in-Agentic-AI-Systems-Learning-Paths.md`](Developing-in-Agentic-AI-Systems-Learning-Paths.md).
The guide is the non-negotiable authority; this document reports conformance
and cannot override it.

## Audit identity

| Item | Audited value |
| --- | --- |
| Audit date | 2026-09-23 |
| Canonical-text guide SHA-256 | `c247b45ed53bb7b901954611c3bc03a37294d9adfb02a6542d71522f694f62be` |
| Framework baseline | `webmaxru/ai-engineering-system@9c8be3c` plus this audit and non-normative bookkeeping repairs |
| Audited reference baseline | `webmaxru/northstar-orders-api-demo@b65c2de5c8224342c72c37eeed7ef9f965ad8a2c`; current `main`, known defective |
| Current inert snapshot source | Candidate PR #27 at `bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7`; local unit and PostgreSQL validation pass, but full validation and hosted acceptance remain blocked; snapshot release status stays `known-defective` |
| Earlier repairs | Terminology, workflow syntax and artifact handoff merged in `webmaxru/northstar-orders-api-demo#7`, `webmaxru/northstar-orders-api-demo#10`, and `webmaxru/northstar-orders-api-demo#12` |
| Current reference work | On 2026-09-28, the owner reopened system-maintenance issues [#14](https://github.com/webmaxru/northstar-orders-api-demo/issues/14), [#16](https://github.com/webmaxru/northstar-orders-api-demo/issues/16), [#20](https://github.com/webmaxru/northstar-orders-api-demo/issues/20), [#22](https://github.com/webmaxru/northstar-orders-api-demo/issues/22), and [#24](https://github.com/webmaxru/northstar-orders-api-demo/issues/24), with plan/implementation PRs [#15](https://github.com/webmaxru/northstar-orders-api-demo/pull/15), [#18](https://github.com/webmaxru/northstar-orders-api-demo/pull/18), [#21](https://github.com/webmaxru/northstar-orders-api-demo/pull/21), [#23](https://github.com/webmaxru/northstar-orders-api-demo/pull/23), [#25](https://github.com/webmaxru/northstar-orders-api-demo/pull/25), [#26](https://github.com/webmaxru/northstar-orders-api-demo/pull/26), [#27](https://github.com/webmaxru/northstar-orders-api-demo/pull/27), and [#28](https://github.com/webmaxru/northstar-orders-api-demo/pull/28), to resume conformance remediation. The earlier closures were scope cancellations, not accepted fixes. Demo issues [#4](https://github.com/webmaxru/northstar-orders-api-demo/issues/4), [#17](https://github.com/webmaxru/northstar-orders-api-demo/issues/17), and draft PR [#19](https://github.com/webmaxru/northstar-orders-api-demo/pull/19) remain open; historical PRs [#13](https://github.com/webmaxru/northstar-orders-api-demo/pull/13) and [#29](https://github.com/webmaxru/northstar-orders-api-demo/pull/29) remain closed. |
| Current conformance decision | **Blocked**: the locked baseline remains defective; reopened maintenance candidates are unmerged and unaccepted, and hosted acceptance/trusted publication remain unestablished |
| Experimental comparison | `reference/ai-engineering-system-agent-hooks@cbb22f1e90f8edcce8e019c4c867af8daebe7605` |

A change to the guide content or hash invalidates this conclusion until the
framework and reference are audited again.

`architecture-lock.json` records the current validated snapshot source and
intentionally blocks a successful release verification while required
reference changes remain pending. The audited `main` baseline remains the
historically inspected `b65c2de…` commit; the PR #27 snapshot is an unaccepted
candidate and is for study, not adoption. Since the snapshot lock points to
`bfb2cbf…`, run the verifier against a Northstar worktree at that exact commit
(not the unchanged `main` checkout) to check the guide,
extension coverage, non-self-governance boundary, one-way Northstar reference,
snapshot, and conformance decision.
On 2026-09-30, that exact-path run verified all 174 locked snapshot files, then
stopped at the expected release gate: the audited reference is `known-defective`,
not accepted. `node --test tools/verify-architecture.test.mjs` passes 7/7.
This is a fail-closed conformance result, not a path or snapshot-integrity error.

The earlier parser/terminology blockers are resolved in the inspected source;
the workflow now creates jobs. This does not imply release acceptance.
The [current audit](AUDIT-2026-09-23.md) records 220 passing unit tests, eight
passing PostgreSQL acceptance tests, additional separate-process application
proof, five Poutine errors despite exit zero, and two moderate dependency
findings. A real cloud planner stopped before producing a plan because live
task authority was absent. A missing-artifact probe exposed a false-positive
readiness decision.

The 117-file snapshot matches the exact audited revision for inspection. It is
**not approved for adoption**. The owner reopened the system-maintenance
workstreams to resume remediation. Reopening restores active work; it does not
accept a plan, implementation, or hosted control. The remaining demo tasks do
not repair the locked baseline, and hosted acceptance and trusted publication
remain unestablished.
The historical candidate evidence below does not change the locked `main`
baseline.

## Demo and reopened-maintenance status (2026-09-30)

| Work | Current evidence | Remaining gate |
| --- | --- | --- |
| Repair and combined-mode controller: issue #14, PRs #15/#18 | PR #18 head `2ce3cf8a69439c22246de7d5449ce186e23bd584`; local `npm run validate` passes (489 unit tests), disposable PostgreSQL acceptance passes 9/9, `npm audit --audit-level=high` reports 0 vulnerabilities, and `agentic:compile` passes | Native review `5356731352` is APPROVED, but hosted `human-review` still fails because GitHub reports `reviewDecision` as not `APPROVED`; repository-controls is unavailable with HTTP 403, and trusted-acceptance fails. Source report `36610256698` is `ready_for_review` with 14/15 criteria proven; AC15 is unverified. Review-event report `36612195971` is `review_required`. Local Zizmor remains blocked with 85 findings. No merge or hosted-setting change is claimed |
| Parallel isolation: issue #16, plan PR #26, implementation PR #27 | Approved plan PR #26 head `42721d4ee34a55cb031567d3942dd037e5bbe513` binds contract `2afe7ed6…`, plan `d020ca88…`, and parent base `2ce3cf8…` (review `5362561711`). PR #27 head `f1c40a961451d29fed04ac37ad01eb63ddec076d` is on that base; local validation passes 541 unit tests, 79 governance checks, and PostgreSQL acceptance 10/10; plan gate passes and scope has 75 paths/zero violations. A local Cloud-shaped hook simulation resolved environment-only session identity through SessionStart and PreToolUse and passed plan-gate; this is not Cloud host evidence. | PR #27 remains draft and unaccepted. Hosted run `36934750341` at exact head `f1c40a9…` passes plan-contract, plan-approval, scope, quality, acceptance, CodeQL, dependency, secret-scan, merge-validation, and governance; `repository-controls`, `human-review`, and `evidence` fail. Reviews target older commits, `validation-authority` is absent, and the report is `review_required` with 9/10 criteria proven (AC1–AC8 and AC10); AC9 remains unproven. The post-fix Cloud run `36930550238` was on predecessor `92a8af6…`; its plan-gate tool call returned `success=false` without result or artifacts. No Cloud session has tested the session-identity fallback, and the bounded retry is exhausted. Full `validate:all` at `f1c40a9…` fails at Zizmor with 83 unsuppressed findings (19 `artipacked`, 61 `unpinned-uses`, and one each `dangerous-triggers`, `obfuscation`, and `template-injection`) |
| Trusted acceptance: issue #24, plan PR #25, implementation PR #28 | PR #25 head `7d0a78d8da741c911a31941477562060ae6c6d66` has exact approval review `5357419226`, contract digest `93a40b20…`, and parent base `2ce3cf8a…`. PR #28 is pushed at `35ac91150fa4088af3132a9dda75bc690d657165` on that base; `npm run validate` passes 525 unit tests, PostgreSQL acceptance passes 9/9, and scope/merge checks pass | A fresh `npm run validate:all` after `npm ci` passes through unit (525/525) and PostgreSQL acceptance (9/9), then fails `npm audit --audit-level=high` with two high advisories: Fastify `<=5.12.4` and `brace-expansion` `4.0.0–5.0.11`; secret-scan and agentic validation were not reached in this run. Issue #24 prohibits manifest changes; the separate PR #27 candidate at `a5c64fc…` reports zero audit vulnerabilities but remains unaccepted. Hosted run `36635911460` fails `human-review` and `repository-controls` while other required checks pass. No acceptance or ruleset change is claimed |
| Repository controls: issue #22, plan PR #23 | Plan work is bound to base `17e7a5c5f1fbf88a92351043c675f555f4c7f04f` | Issue and PR are reopened; the #24 preflight remains blocked. No ruleset setting was changed |
| Workflow scanner: issue #20, plan PR #21 | Refreshed plan head `6795e32beba33e7ac109bf020ae8f3b377042cc4` is based on `17e7a5c5f1fbf88a92351043c675f555f4c7f04f`; contract digest `df654e265c20e6390e31b6e3d3939c20ef2202584241942f57df282684245f76`, plan digest `76a25183507e0702bcdd14db89577d4c59a9f508030fba7804692a6b781172e3`; exact-head review, `plan-approval`, and `human-review` pass | Hosted `evidence` and `repository-controls` fail; implementation stays blocked by issue #22 |
| WI-1842 rehearsal: issue #4, PR #13 | The issue remains as the plan-first demo task; PR #13 recorded the planner stopping because the cached task contract was absent | PR #13 is a closed stale, zero-file rehearsal; it does not prove a successful cloud run. Historical PR #29 is also closed after using the wrong base and making no changes |
| Endpoint demonstration: issue #17, PR #19 | Head `cf7622166e48cdc543121adaa37a0ab57dcb4c45`; exact-head approval and hosted `human-review` pass; local `validate` (470 unit tests), PostgreSQL acceptance (12/12), scope and merge checks pass | PR #19 remains draft; full `validate:all` fails at Zizmor (86 findings, 65 errors/21 notes), hosted `repository-controls` fails, and no successful issue #17 cloud run is proven |

## Follow-up local and owner-session evidence (2026-10-01)

The coordinator's isolated local worktree is bound to live `Task PR: #27`,
Issue #16, and approved plan #26. The implementation is published at
`f1c40a961451d29fed04ac37ad01eb63ddec076d`. `SessionStart` and `PreToolUse`
now resolve a host-provided session ID from the event payload or the Copilot
session environment; when neither is present, GitHub Actions repository/run/
attempt identity is used consistently for the task session and workspace
owner. In a local Cloud-shaped simulation with no session ID in the event
payload, the hook resolved PR #27, plan #26, base, branch, and head; PreToolUse
allowed the authorized plan gate, which passed. This is local simulation, not
Cloud-host evidence.

At `f1c40a9`, `npm run validate` passes instruction sync, 79 governance
checks, lint, typecheck, build, and 541 unit tests. PostgreSQL acceptance
passes 10/10 using per-suite temporary schemas; npm audit reports zero
vulnerabilities, secret scanning passes 199 files, and agentic workflow
compilation is clean. Exact-base scope reports 75 paths and zero violations.
The full `npm run validate:all` reaches pinned Zizmor and fails on 83
unsuppressed findings (19 `artipacked`, 61 `unpinned-uses`, and one each
`dangerous-triggers`, `obfuscation`, and `template-injection`).

Hosted run
[`36934750341`](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/36934750341)
on `f1c40a9` passes plan-contract, plan-approval, scope-policy, quality,
acceptance, dependency review, CodeQL, secret-scan, merge-validation, and
governance. It fails repository-controls, human-review, and evidence; visible
approvals target older commits, `validation-authority` is missing, and the
report is `review_required` with 9/10 criteria proven. PR #27 remains draft
and unaccepted.

Cloud run
[`36930550238`](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/36930550238)
was a bounded, read-only attempt on predecessor `92a8af6`, before the
environment-session fallback was published. Its one `plan:gate` tool call
returned `success=false` without a command result; no artifacts or PR changes
resulted. No Cloud canary has verified the `f1c40a9` identity changes. AC9
and hosted `ready_for_acceptance` remain unproven. No permissions, secrets,
rulesets, or protected settings changed.

A separate VS Code 1.140.0 window opened the local `northstar-pr27` worktree in
Restricted Mode. Its trust banner states that trusting the folder enables all
features; Copilot is disabled in this mode. No trust decision was made, and no
Copilot agent, workspace task, or project hook was run. This is an attempted
host inspection, not VS Code runtime evidence; host parity remains unverified.

## PR-comment Cloud continuation evidence (2026-10-01)

To continue the existing PR rather than assign another writer, a scoped
`@copilot` comment was posted on PR #27. Copilot Cloud run `36854976862`
started at head `bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7` and finished two
minutes later without changing the PR. Its session record states: “no task
issue is active”; the authorizer denied `runtime-tools-vote_memory` because
no task contract was active and rejected the first shell inspection because
it chained commands (`git status ... && git rev-parse ...`). Later
`git rev-parse` and `pwd` inspections also failed. The run is not
implementation or validation evidence.

A corrected continuation comment `5931423920` began with `/implement 16` and
instructed the agent to establish task/plan/owner identity before editing,
use authorized commands individually, preserve PR #27's branch and stack
#31, and stop on any authorization denial. Cloud run `36861785538` started
at `bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7` and finished at
2026-10-01T12:28:32Z without a commit. Its Actions trace shows failed reads
of `artifacts/task-contract.json`, `artifacts/task-session.json`, and
`artifacts/task-workspace-owner.json`; the Git identity/revision commands
were also denied. Issue, PR, and plan reads through GitHub MCP succeeded, but
the run produced no evidence that an active task contract and owner were
loaded. PR #27 remains draft at the same head and base. The corrected selector
alone did not produce an implementation or Cloud validation result.

A third continuation comment `5931655271` used the explicit `Task issue: #16`
and `Task role: implement` selectors. GitHub workflow run `36863278843` was
created at `2026-10-01T12:39:58Z` and completed successfully at
`2026-10-01T12:41:53Z`, but the task activity stopped before edits. The
selector did not activate a task contract: `artifacts/task-contract.json`,
`artifacts/task-session.json`, and `artifacts/task-workspace-owner.json` were
missing, so repository commands were denied. PR #27 remains draft at the same
head and base. The workflow's successful conclusion is not implementation,
task-binding, or validation evidence.

A fourth, post-fix continuation comment `5932587372` was posted after commit
`b05b481…`. Copilot Cloud run `36869969461` was created at
`2026-10-01T13:36:50Z` and its workflow completed successfully at
`2026-10-01T13:38:48Z` on that head; PR #27 did not change. The log shows
attempted reads of `task-contract.json`, `task-session.json`,
`task-workspace-owner.json`, and `execution-context.json`, but all four
`view` calls returned `success=false`. Bash and GitHub issue/PR reads did
complete, yet neither the artifact contents nor a task-binding result were
available in the workflow log or session history. The green workflow wrapper
therefore does not prove an active Cloud task contract or AC9; no successful
Cloud canary is claimed.

Two bounded follow-up canaries were run on PR #27 predecessor head
`a5c64fc2b4d5d09b99b1b79747275525f21751c2`. The request in comment
`5937004816` started Cloud run `36900971355`; its log records the standalone
`npm run contract:fetch -- --issue 16` tool call as successful, but the agent
did not invoke the plan gate, published no result comment, and the run exposed
no artifacts. Contract-fetch success alone does not prove an active
implementation role, PR selector, owner/session binding, or AC9. A follow-up
request in comment `5937072552` started run `36901509449` with only
`npm run plan:gate -- --pr 27`; the Cloud tool log records `bash
success=false`, but exposes no command result or actionable denial reason.
That run also published no artifacts and did not change PR #27. The successful
workflow wrappers are not plan-gate or task-binding evidence; AC9 remains
unproven.

A third bounded post-fix Cloud canary was requested in comment
`5941268614` on PR #27 head `92a8af62939847c0ba3120128afbb3129a12cab6`.
Run `36930550238` attempted the single `npm run plan:gate -- --pr 27`
command; the tool log again records `bash success=false` without a command
result, task-session output, or artifacts. The PR did not change. This was
before the later host-session environment fallback at `f1c40a9`; there is no
actual Cloud run validating that follow-up. The repeated opaque tool failure
remains unclassified and the bounded retry is exhausted, so AC9 stays
unproven.

### Predecessor Cloud PR-identity fix (head 92a8af6)

The owner-bound PR #27 worktree exposed a separate concrete mismatch in
`scripts/execution-context.mjs`: it rejected the actual same-repository
implementation PR because its author was a human and its branch was
`agent/implement/aes-parallel-isolation`, despite the live PR, linked Issue
#16, approved plan #26, base, head, and ancestry matching. The guide's
contributor model says to evaluate agent and human pull requests by the same
workflow standards (Learning Path Unit 6, lines 385-400). The published fix
removes only the author-class and branch-prefix checks; exact PR/task/plan/base/
head and ancestry validation remains required.

This correction was published in draft PR
[#27](https://github.com/webmaxru/northstar-orders-api-demo/pull/27) at
`92a8af62939847c0ba3120128afbb3129a12cab6`, on base
`2ce3cf8a69439c22246de7d5449ce186e23bd584`. The focused execution-context
test and full `validate` pass (535 unit tests, 79 governance checks, lint,
typecheck, and build); the plan gate passes and the exact-base scope check
reports 72 paths with zero violations. PostgreSQL acceptance passes 10/10
using per-suite temporary schemas; dependency audit reports zero
vulnerabilities, secret scan passes, and workflow compilation is clean.
`validate:all` reaches Zizmor and fails on the 83 unsuppressed findings.

Hosted run
[`36929325151`](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/36929325151)
on this head passes plan-contract, plan-approval, scope-policy, quality,
acceptance, dependency-review, CodeQL, secret-scan, merge-validation, and
governance-policy. It fails repository-controls, human-review, and evidence;
the approvals visible on PR #27 target older commits, so the current-head
human-review gate correctly fails. The evidence report is `review_required`
with 9/10 criteria proven; `validation-authority` is missing and AC9 remains
unproven. No successful Cloud task-binding run was produced. This predecessor was published for review, not accepted Northstar behavior or
conformance evidence; the later `f1c40a9` follow-up is recorded below.

The local CLI canaries establish only that two separately owned worktrees
loaded matching task, contract, plan, base, session and owner identities. They
do not prove every VS Code lifecycle hook or hosted acceptance. The separate
GitHub.com `/plan 16` session `d1dd79e9-183b-473c-a2c5-b7b6e7a2fff5`
produced an unapproved proposal on `copilot/plan-16`, which is based on `main`
at `b65c2de5c8224342c72c37eeed7ef9f965ad8a2c`, not the approved `17e7a5c`
base. It is not valid base-binding evidence. Session
`5724baed-e173-4722-95ae-077e90c39c6a` confirmed issue/plan/PR metadata but
could not verify active task/session authority and used workspace branch
`copilot/agentimplementaes-surface-evidence`, not PR #27's
`agent/implement/aes-parallel-isolation`. The later session
`0621d3a5-e662-47f5-b737-bdca4dbe01c4` selected the custom `plan` agent and
the exact base branch at `17e7a5c5f1fbf88a92351043c675f555f4c7f04f`. After
the issue body was supplied, it produced a chat-only plan proposal; its
`contractDigest` is an unresolved sentinel because no task-contract artifact
was available and the planner had no shell. The branch remains at the base;
no commit or PR resulted. The plan is not publishable or approved until its
contract digest is bound and the plan-only state is independently reviewed.
This is evidence of a cloud task-contract bootstrap failure, not of a
permission denial or successful cloud execution. No parallel cloud proof is
established.

A fresh local Issue #20 plan-refresh session on branch
`webmaxru-turbo-carnival` also stopped before repository inspection. The
`/plan 20` startup attempted to load the `gh` skill and PreToolUse denied it
because no task contract was active; a follow-up with explicit `Task issue:
#20` and `Task role: plan` was denied because `"skill" is not a tool this
policy recognizes`. The session read no issue/PR/scanner data, wrote no plan,
and changed no files or remote state. PRs #21 and #23 remain bound to the
stale `17e7a5c…` base while PR #18 is at `2ce3cf8…`; no refreshed approval
exists. This is an unverified session bootstrap, not a reason to relax policy.

A separate fresh detached local worktree at base `17e7a5c5f1fbf88a92351043c675f555f4c7f04f`
resolved live issue #16 with `npm run contract:fetch -- --issue 16` and
recorded body digest `2afe7ed62ca5f99393f36177182291355fb014dc70949456b2116e64e9a736f1`.
That digest matches approved plan PR #26, whose exact-head review and
`plan-approval` check pass. The chat-only cloud proposal leaves the digest
unresolved and repeats the issue's statement that PR #26's approval is stale;
this conflicts with the current plan/base/check evidence. Do not publish,
approve, or implement the chat proposal until the contract binding and that
conflict are reconciled.
The system-maintenance items are reopened, but none of these statuses accepts
their plans or implementations.

For this framework follow-up, `node --test tools/verify-architecture.test.mjs`
passes 7/7 and `npm run build` in `docs-site` produces 20 pages. A verifier run
against a temporary detached Northstar worktree at the exact locked commit
`bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7` verified all 174 snapshot files,
then correctly stopped because that reference remains `known-defective` and
conformance is blocked. Running it against current PR #27 head `a5c64fc…`
instead stops on the expected snapshot-revision mismatch. `architecture-lock.json`
and `templates/northstar/reference-lock.json` remain at `bfb2cbf…`; Northstar
`main` remains `b65c2de…`. The unaccepted candidate is not published as an
adoption snapshot.

## Interpretation rules

The guide contains requirements, choice-based designs, conditional
technologies, recommendations, and examples. Strict conformance means:

- **Required** architecture is implemented without contradiction or
  substitution.
- **Choice-based** guidance keeps the guide's valid alternatives and records
  which alternative is used for each risk class.
- **Conditional** technology is required when the corresponding capability is
  enabled; it is not forced into repositories that do not use that capability.
- **Recommended** guidance is explicitly identified and may be adopted when it
  fits the repository; adopting it does not turn the recommendation into a
  universal guide requirement.
- **Examples** demonstrate a valid shape but do not freeze owner names, action
  versions, labels, file contents, or command syntax unless the surrounding
  text makes them mandatory.
- A stricter mechanism is acceptable only when it preserves the guide-defined
  behavior and is registered in
  [`TECHNICAL-EXTENSIONS.md`](TECHNICAL-EXTENSIONS.md).

Status values in this audit:

- **Conformant** - the source implementation matches the guide requirement.
- **Conformant + extension** - the guide requirement is present and a
  documented mechanism makes it concrete or stricter.
- **Choice applied** - Northstar selects one of the guide's supported patterns.
- **Recommended / adopted** - Northstar adopts a guide recommendation without
  representing it as mandatory architecture.
- **Conditional / not applicable** - the guide requires the behavior only when
  a capability is used, and Northstar does not use that variant.
- **Blocked** - source or hosted evidence exposes a defect that prevents the
  reference from supporting the conformance claim.
- **Hosted not verified** - source expresses the required control, but only
  live GitHub state can prove enforcement.

## Requirement matrix

| Guide basis | Guide architecture and terminology | Framework and Northstar implementation | Status | Extension |
| --- | --- | --- | --- | --- |
| Unit 1 and Unit 3, lines 34-58 and 138-210 | **plan → act → evaluate** is a visible loop; evaluation uses system signals rather than confidence | Design exposes the phases; missing-artifact and stale-report paths undermine trustworthy evaluation | Design aligned; execution **blocked** | EXT-006, EXT-010 |
| Unit 4, lines 212-288 | GitHub is the **system of record and control plane** | Issues, pull requests, commits, reviews, workflows, checks, CODEOWNERS, rulesets, and environments own durable state and enforcement; conversations are not authority | Conformant; hosted enforcement not verified | EXT-013, EXT-018 |
| Unit 5 and Unit 6, lines 307-430 | Humans remain accountable and agent work is evaluated through the **contributor model** | Agents may plan, implement, and review, but cannot accept their own output; pull requests are evaluated for intent, scope, evidence, ownership, policy, and fallback | Conformant; live review evidence not verified | EXT-006, EXT-007 |
| Unit 2, lines 508-533 and 2296-2326 | Agents have narrow SDLC responsibilities and bounded scopes | Planner, implementer, dependency, security-reviewer, and risk-reviewer roles have distinct tools, instructions, and handoffs | Conformant | EXT-004 |
| Unit 3 and Unit 5, lines 553-624 and 3454-3598 | A **task contract** defines inputs, outputs, scope, constraints, and observable **success criteria** | Live issue parser works when explicitly invoked; actual cloud bootstrap missed authority and local task switching exposed stale context | Host bootstrap **blocked** | EXT-001 |
| Unit 4 and Unit 5, lines 635-867 | Planning, execution, and validation are separated; use a **plan-first workflow** or **plan + execution workflow** based on risk; planning is read-only | Read-only planning preserved; implementation authorizer requires approved plan/branch even at lower risk, so advertised plan + execution is not proved | Choice advertised but incompletely implemented | EXT-001, EXT-003 |
| Unit 2 and Unit 4, lines 3835-3967 and 4165-4223 | **Risk-based autonomy** is required; the guide recommends low, medium, high, and critical classifications and stronger controls at higher-impact boundaries | Four-level model exists; catch-all medium rule masks low-risk documentation paths | Recommended model adopted; classifier **blocked** | EXT-002 |
| Unit 4, Unit 5, and Unit 7, lines 244-278, 1196-1200, and 3998-4307 | Required reviews, required checks, CODEOWNERS, rulesets or branch protection, environments, explicit permissions, and **least privilege** constrain work | Source policy, workflows, CODEOWNERS, role toolsets, protected-environment design, and GitHub App permission boundaries implement the model | Conformant; hosted settings not verified | EXT-004, EXT-008, EXT-009 |
| Unit 7 and Unit 4, lines 1145-1183, 1748-1836, 2893-2907, and 4048-4070 | Hooks provide pre-action blocking, post-action/error logging, and human escalation; custom agents declare tools, instructions, and handoffs | Candidate PR #27 bounds live `SessionStart` and `UserPromptSubmit` resolution at 90 seconds after a measured 55.076-second resolver run. `PreToolUse` remains 10 seconds and denies missing authority when it completes, but the host documents command-hook timeouts as fail-open, including that hook. Local parallel CLI resolution passes; two cloud tasks lacked the task-contract artifact, and logs do not expose the underlying hook failure/timeout cause. Other host payload, failure-event, and diagnostic gaps remain | **Blocked**; see surface matrix | EXT-004, EXT-005 |
| Unit 6, Unit 7, and workflow units, lines 916-1100, 1334-1441, 1915-1980, and 2365-2591 | GitHub Actions expose triggers, contexts, outputs, permissions, concurrency, orchestration, logs, and artifacts | Repaired workflow creates jobs; examined run fails repository-controls, human-review, plan-approval and evidence | Jobs demonstrated; acceptance **blocked** | EXT-006, EXT-011 |
| Unit 5, Unit 6, and Unit 7, lines 340-373, 1016-1094, 2708-2816, and 4338-4392 | Meaningful actions produce attributable, run- and commit-linked **workflow outputs and artifacts**; missing evidence is failure | Envelopes exist but absent artifact/null digest can produce readiness; base/attempt and stale Stop report checks are incomplete | **Blocked**, not strict fan-in | EXT-005, EXT-006 |
| Memory and continuity units, lines 3088-3439 | Issues, pull requests, documents, workflow outputs, logs, and artifacts form external memory and a durable **source of truth** | Fixture trust stays false; live resolution and cache freshness across hosts are not reliable | Design aligned; bootstrap **blocked** | EXT-001, EXT-018 |
| Security units, lines 259-278, 402-413, 1127-1145, and 4038-4048 | Code scanning, dependency signals, secret scanning, push protection, protected secrets, and environment approvals remain blocking signals | SARIF `{}` passes; read errors can skip scan inputs; workflow scanner errors do not propagate; hosted settings unverified | **Blocked** | EXT-008, EXT-015 |
| MCP units, lines 1103-1145 and 1447-1691 | MCP servers expand capability and must be governed through registries and organization/enterprise **allow lists** with bounded tools and protected credentials | Policy requires approved registries and an MCP allow list; Northstar's local gh-aw adapter exposes named tools only and stores no credentials | Conformant in source; hosted registry/allow list policy not verified | EXT-014 |
| Agentic Workflow units, lines 1260-1274, 1349-1441, and 2365-2591 | GitHub Agentic Workflows express bounded intent in Markdown, compile to a lock workflow, use explicit triggers/tools/permissions/safe outputs, and augment rather than replace CI/CD | Source uses bounded staged output; examined hosted agent failed on model availability | Source aligned; hosted operation **blocked** | EXT-011 |
| Reliability units, lines 1052-1076, 1183-1200, 2047-2108, 2834-2881, and 4432-4447 | Recovery uses **bounded retries**, rollback, and human escalation; policy and security failures are not retried away | Failure-signature helper tested in isolation, not integrated into Stop-loop persistence/enforcement | Integration **blocked** | EXT-010 |
| Governance units, lines 3822-3967 and 4412-4457 | Governance is continuous; the guide recommends weekly review of failures, monthly review of permissions and secret scopes, and quarterly review of rules, ownership, environments, retention, and evidence | Cadence adopted; actual hosted audit could not authenticate and returned unavailable, not ready | Recommended / adopted; live audit **blocked** | EXT-009 |

## Named technology disposition

| Guide-named technology or feature | Northstar disposition |
| --- | --- |
| GitHub Issues, branches, commits, pull requests, reviews | Implemented |
| Required checks, CODEOWNERS, rulesets or branch protection | Source policy implemented; live enforcement not verified |
| Protected environments and required reviewers | Source workflows and policy implemented; live configuration not verified |
| GitHub Actions triggers, contexts, outputs, permissions, concurrency, artifacts | Real jobs started; required acceptance checks failed |
| CodeQL/SARIF, dependency signals, secret scanning, push protection | Source present; malformed SARIF/read-error gaps; two moderate dependencies; hosted settings not verified |
| GitHub Copilot agents, Copilot CLI hooks, prompts, instructions, handoffs | Partially exercised; see [COPILOT-SURFACES.md](COPILOT-SURFACES.md) |
| GitHub Agentic Workflows / Continuous AI / `gh-aw` | Compiles; scanner errors and hosted model failure prevent operational claim |
| MCP servers, registry, MCP allow list, GitHub MCP server | Policy and bounded tools implemented; organization/enterprise registry and allow list settings not verified |
| `GITHUB_TOKEN` and GitHub App tokens | Explicitly scoped in workflows; live App installation and permission state not verified |
| Personal access tokens | Not used by the canonical reference |
| Custom MCP Registry v0.1 or Azure API Center registry | Conditional option not used by Northstar |

## Example handling

The reference does not treat illustrative snippets as universal requirements.
In particular:

- action versions from guide snippets are not frozen requirements;
- sample CODEOWNERS entries, labels, titles, and reviewer names are replaced
  with repository-specific values;
- the example `plan-gate.yml` and pull-request template are implemented with
  equivalent, stricter contracts rather than copied as the only valid shape;
- the `gh agent-task` and Copilot CLI command examples remain operational
  examples, not required system interfaces;
- custom MCP registry hosting and Azure API Center remain optional because
  Northstar does not operate a custom registry.

## Gap-filling implementation disposition

The audit records each identified non-guide implementation in
[`TECHNICAL-EXTENSIONS.md`](TECHNICAL-EXTENSIONS.md). The register covers:

- versioned contracts, digests, risk floors, branch conventions, and exact
  pre-tool authorization;
- payload-minimized hook records, evidence envelopes, readiness states,
  validation authority, trusted publication, identity separation, and
  maintenance manifests;
- governance drift queries, failure signatures, the reference toolchain,
  supplemental scanners, and merge validation;
- the PostgreSQL proving workload, repository separation, single README
  reference, inert snapshot locking, controlled bootstrap, MCP adapter,
  instruction synchronization, and the Agent Hooks experiment.

No extension replaces a guide-required GitHub control. When a source file can
only describe a hosted setting, the corresponding status remains **hosted not
verified**. `architecture-lock.json` provides machine-readable extension
coverage; semantic completeness still requires human architecture review.

## Current hosted evidence boundary

The following claims require live GitHub evidence and are not established by
the repository snapshot alone:

- ruleset or branch-protection enforcement and required status bindings;
- current CODEOWNERS review enforcement;
- protected-environment reviewers, branch restrictions, self-review
  prevention, and administrator-bypass settings;
- GitHub App installation IDs, permissions, identity separation, and private
  key locations;
- secret scanning and push protection enablement;
- current pull-request reviews and immutable-head status;
- workflow run provenance, artifact retention, and the stable
  `trusted-acceptance` status;
- organization or enterprise MCP registry and allow list policy;
- successful hosted execution of the compiled Continuous AI workflow.

These controls must be reported as **not verified** until the corresponding
GitHub API query or workflow run supplies direct evidence.

## Audit conclusion

The architecture has no identified conceptual conflict with the guide, selects
guide-supported choices by risk, distinguishes adopted recommendations, and
keeps conditional technologies conditional. No guide requirement is
intentionally replaced.

The current release is nevertheless **not conformant**. The earlier workflow
syntax and terminology blockers were repaired in merged Northstar PRs #7, #10
and #12; they are no longer the release blocker. The locked `main` revision
still has task/bootstrap, evidence-integrity, risk-routing, recovery and
scanner defects, while the newer repair and isolation candidates have not
produced trusted hosted acceptance. The architecture lock therefore
correctly fails closed. Conformance may be restored only after the dependent
Northstar changes are accepted, exact evidence is published for an immutable
accepted commit, the inert snapshot and locks are refreshed to that commit,
and `pwsh -File tools/verify-architecture.ps1` passes without bypassing its
release gate.
