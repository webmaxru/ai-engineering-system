# Reference implementation walkthrough

Northstar demonstrates the architecture required by
[Developing-in-Agentic-AI-Systems-Learning-Paths.md](Developing-in-Agentic-AI-Systems-Learning-Paths.md).
Its extra mechanisms are registered in
[TECHNICAL-EXTENSIONS.md](TECHNICAL-EXTENSIONS.md).

**Current status: inspection only, not an accepted adoption release.**
The audit at `b65c2de5c8224342c72c37eeed7ef9f965ad8a2c` found operational
defects despite passing application tests. See
[GUIDE-CONFORMANCE.md](GUIDE-CONFORMANCE.md) and
[AUDIT-2026-09-23.md](AUDIT-2026-09-23.md).
On 2026-09-28 the owner reopened system-maintenance issues #14, #16, #20, #22
and #24, and their associated plan/implementation PRs, to resume conformance
remediation. Their earlier closures were cancellations, not accepted fixes.
Demo issues #4 and #17 and draft demo PR #19 also remain open.

## Run and inspect

Use the exact commands, prerequisites, expected responses and cleanup in
[the WI-1842 runbook](END-TO-END-DEMO.md). It separates:

| Proof | What it establishes | What it does not establish |
| --- | --- | --- |
| Fixture `demo:system` | Local parser/policy/evaluation rehearsal | Live issue authority, valid approval or correct behavior of every evaluator path |
| Unit tests | In-process behavior of tested code paths | Distributed execution or hosted settings |
| PostgreSQL acceptance | Two service instances over actual database durability | Two independent server processes; existing suite uses Fastify injection |
| Additional audit harness | Real HTTP across independent processes and replay after restart | A committed regression suite or cloud-agent success |
| Current issue #16 local CLI canaries | Two simultaneous read-only Copilot CLI 1.0.90-2 sessions at predecessor `bb767fc…` matched the live task, contract `2afe7ed6…`, approved plan `d020ca88…`, base `2ce3cf8…`, and implementation PR #27; each had a distinct workspace owner and made no source changes | Write authorization, Stop behavior, VS Code behavior, cloud execution, or hosted acceptance |
| Historical cloud rehearsal, PR #13 (closed) | Planner correctly stopped without WI-1842 task authority; no plan or files were produced | Implementation-to-acceptance completion |
| Historical issue #16 cloud attempt, PR #29 (closed) | GitHub.com run created a draft PR on `main` with zero changed files | The approved `17e7a5c…` base, independent cloud isolation, or a successful agent outcome |
| Current issue #16 cloud canary | Session `26c6b1b9-9f6f-43f7-81bc-e457b915b440` / PR #30 used predecessor candidate base `bb767fc…`, but the agent log reported `artifacts/task-contract.json` absent and no source files changed | Cloud contract/plan binding and parallel isolation remain unproven |

Latest GitHub.com session
[0621d3a5-e662-47f5-b737-bdca4dbe01c4](https://github.com/webmaxru/northstar-orders-api-demo/tasks/0621d3a5-e662-47f5-b737-bdca4dbe01c4)
used the custom `plan` agent and the exact approved base branch. After the
issue body was supplied, it generated a chat-only proposal, but the plan's
`contractDigest` remains an unresolved sentinel because the task-contract
artifact was not resolved and the planner had no shell. A separate local
resolver fetched the issue with body digest
`2afe7ed62ca5f99393f36177182291355fb014dc70949456b2116e64e9a736f1`, which
matches approved plan PR #26. The branch remains at the base; no commit,
source change, or PR resulted, so the proposal is not publishable and cloud
task-contract bootstrap remains blocked. Its assertion that PR #26 approval
is stale conflicts with current GitHub evidence and needs human reconciliation.

The runbook's local `ready_for_review` output must not be presented as
`ready_for_acceptance`. The inert snapshot is pinned to candidate
`bfb2cbf…`, but the live PR #27 head is `f1c40a961451d29fed04ac37ad01eb63ddec076d`
on parent base `2ce3cf8…`. Parent PR #18 has since advanced to
`2222e882…`, so PR #27's base and approved plan require refresh before
further implementation. Hosted run
[`36984950941`](https://github.com/webmaxru/northstar-orders-api-demo/actions/runs/36984950941)
passes current-head human-review and core validation but fails
`repository-controls` and `evidence`; `validation-authority` is absent and
AC9 remains unproven. The report is `review_required`. The maintenance
workstream is active again, but no acceptance or conformance is established.

## Trace the control loop

Read the live issue, machine plan, risk policy, approval records, scoped
implementation, deterministic checks, execution report and independent
acceptance in that order. The [implementation map](REFERENCE-IMPLEMENTATION.md)
locates these artifacts. Stop when live authority, evidence or hosting controls
are missing; never replace them with fixture data.

## Select features for another repository

Start with [QUICKSTART.md](QUICKSTART.md): contracts/context, independent
checks/review, read-only roles, MCP governance and Continuous AI are separate
guide practices. The integrated Northstar protocol is a coupled bundle and
is currently blocked for adoption.

The [full installation reference](FULL-INSTALLATION.md) preserves the detailed
bootstrap procedure for a future accepted release. Selecting one practice
does not make the whole repository conformant.

## Prepare a technical session

Use [WI-1842](END-TO-END-DEMO.md) for the observed local application invariant
and the honestly blocked cloud handoff. Maintenance issues #14, #16, #20, #22
and #24 and their PRs have been reopened; their prior scope cancellations do
not resolve the conformance blockers. The order-read endpoint has
a draft candidate rebased onto `17e7a5c`, plus local PostgreSQL evidence and an
approved exact-head review; full Zizmor, hosted repository-controls and
cross-surface proof remain outstanding. See
[the endpoint runbook](NEW-ENDPOINT-DEMO.md). Pin recordings and artifacts to
exact commits; label designs, rehearsals and completed hosted runs separately.
