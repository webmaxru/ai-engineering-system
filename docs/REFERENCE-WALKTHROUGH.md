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
On 2026-09-28 the owner closed system-maintenance issues #14, #16, #20, #22
and #24, and their associated PRs, to retain demo-only open work. These
closures are cancellations, not accepted fixes. Only demo issues #4 and #17
and draft demo PR #19 remain open.

## Run and inspect

Use the exact commands, prerequisites, expected responses and cleanup in
[the WI-1842 runbook](END-TO-END-DEMO.md). It separates:

| Proof | What it establishes | What it does not establish |
| --- | --- | --- |
| Fixture `demo:system` | Local parser/policy/evaluation rehearsal | Live issue authority, valid approval or correct behavior of every evaluator path |
| Unit tests | In-process behavior of tested code paths | Distributed execution or hosted settings |
| PostgreSQL acceptance | Two service instances over actual database durability | Two independent server processes; existing suite uses Fastify injection |
| Additional audit harness | Real HTTP across independent processes and replay after restart | A committed regression suite or cloud-agent success |
| Historical issue #16 CLI canaries | Two separate worktrees matched task/contract/approved-plan/base/session/owner identity before issue #16 was closed | Write authorization, all hook events, recovery, VS Code behavior, or cloud acceptance |
| Historical cloud rehearsal, PR #13 (closed) | Planner correctly stopped without WI-1842 task authority; no plan or files were produced | Implementation-to-acceptance completion |
| Historical issue #16 cloud attempt, PR #29 (closed) | GitHub.com run created a draft PR on `main` with zero changed files | The approved `17e7a5c…` base, independent cloud isolation, or a successful agent outcome |

The runbook's local `ready_for_review` output must not be presented as
`ready_for_acceptance`. Closed PR #27's historical local validation (500 unit
tests, 10 PostgreSQL acceptance tests, scope, and merge checks) did not make
it accepted: its full `validate:all` run failed on 84 Zizmor findings and its
hosted evidence and repository-controls checks failed. The owner closed the
system-maintenance workstream without resolving those blockers.

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
and #24 and their PRs were closed by the owner as scope cancellations; those
closures do not resolve the conformance blockers. The order-read endpoint has
a draft candidate rebased onto `17e7a5c`, plus local PostgreSQL evidence and an
approved exact-head review; full Zizmor, hosted repository-controls and
cross-surface proof remain outstanding. See
[the endpoint runbook](NEW-ENDPOINT-DEMO.md). Pin recordings and artifacts to
exact commits; label designs, rehearsals and completed hosted runs separately.
