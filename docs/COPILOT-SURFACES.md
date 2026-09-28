# Copilot execution surfaces

The authority remains
[Developing-in-Agentic-AI-Systems-Learning-Paths.md](Developing-in-Agentic-AI-Systems-Learning-Paths.md).
The same instructions or hook file do not prove equivalent execution across
hosts. The baseline matrix records observations on 2026-09-23; the follow-up
section records current candidate evidence as of 2026-09-28. Neither is a
support promise.

## Evidence matrix

Audited Northstar: `b65c2de5c8224342c72c37eeed7ef9f965ad8a2c`.

| Capability | Local CLI | VS Code | Copilot cloud agent |
| --- | --- | --- | --- |
| Deterministic scripts | `validate` and PostgreSQL checks passed on Windows, Node 22.23.0 | Can use the same terminal commands; interactive run not performed | Earlier governed CI jobs ran on Linux; this is not an agent-terminal test |
| Live task resolution | Explicit `AGENT_TASK_ISSUE=4` canary read the trusted live contract | Not exercised | Actual `/plan 4` task stopped: contract cache missing |
| New task freshness | Second CLI planner requested issue 14 but saw cached issue 4 and correctly stopped; direct resolver then fetched 14 | Not exercised | No stale-cache/refresh proof |
| Edit-path/branch handling | Absolute-path probe was incorrectly denied | Not exercised; same path-shape risk | Exact local branch rule rejects observed `copilot/wi-1842-rehearse-plan` |
| Planner result and role Stop | Read-only context canary only; no usable plan persisted | Not exercised | No usable plan persisted |
| Denial/audit/recovery | Pure-function probes found payload echo and failure-event misclassification; no end-to-end recovery proof | Not exercised | `ask` is not an interactive approval path; it becomes deny |
| Implementation through acceptance | Not established | Not established | **Blocked**, not completed |

Versions observed: Copilot CLI 1.0.89-0; VS Code 1.138.0
(`7debcd0e2acdea1c52de81bf9ee1620444407dda`). A version check is not a VS Code
canary. VS Code's selected Local versus Copilot Agent Host harness matters.

## Current follow-up evidence (2026-09-28)

| Surface | Current evidence | Result |
| --- | --- | --- |
| Copilot CLI | Historical issue #16 canaries in separate worktrees matched the task, contract, approved plan, base, session, and workspace-owner identities. No source changes were made by these read-only canaries. Issue #16 is now closed by owner scope direction. | Partial pass for identity binding only; they do not prove write authorization, Stop behavior, recovery, or full host parity. |
| Copilot CLI validation | Closed PR #27 at `fc59deefc31213b2c596bd0384008f77a9955c4f`: `npm run validate` passed 500 unit tests and 79 offline governance checks; `npm run test:acceptance` passed 10/10; scope (66 paths, zero violations) and merge checks passed against base `17e7a5c5f1fbf88a92351043c675f555f4c7f04f`. | Historical local evidence only. `npm run validate:all` exits 1 at Zizmor: 84 findings (64 errors, 20 notes); hosted evidence and repository-controls failed. |
| VS Code | The running VS Code window did not expose an actionable accessibility tree or screenshot, and no live Local/Agent Host session was completed. | Unverified. |
| Copilot cloud | WI-1842 planner PR #13 was closed as a stale, zero-file rehearsal after the cached task contract was absent. The issue #16 attempt PR #29 was closed after using `main` and producing zero changed files. | Neither is an AC9 canary; no successful cloud isolation run is proven. |
| GitHub.com agent UI | The repository Agents page displayed “Unable to load tasks” with a stale-cache/account-switch warning during this check; no new task was started. | Platform/UI retrieval failure, not a successful or failed agent execution. |
| Hosted candidate gates | PR #19 at `cf762216…` remains draft with exact-head approval and passing `human-review`; `repository-controls` fails. PRs #27 and #28 were closed by owner scope direction; #27 had failing hosted `evidence`/`repository-controls`, and #28 had a passing `evidence` check but failing `repository-controls`. | No candidate has `ready_for_acceptance`; closures and approvals do not bypass failed trusted-control/evidence gates. |

PR #27's `npm run validate:all` failure is historical: issue #20 and its plan
were closed by owner scope direction without scanner fixes. Issue #22 and its
plan were also closed without a ruleset change. No permissions, secrets,
rulesets, or protected environment settings were changed to make these checks
pass.

## Host differences that need explicit adaptation

| Boundary | Required interpretation |
| --- | --- |
| Event names and JSON | Current docs describe PascalCase compatibility and snake_case payloads. Test actual event envelopes, tool names, argument shapes, and result fields; filename discovery alone is insufficient. |
| Commands and timeout | Supported `command`/timeout aliases do not establish identical error semantics. Test nonzero exit, timeout, malformed JSON, and missing executable. |
| Prompt submission | Cloud prompt hooks fire at most once. Do not depend on later interactive slash commands repairing task identity. |
| Permission decisions | Cloud converts `ask` to deny. A denial must surface an operator action, not an automated retry loop. |
| Role-specific hooks | Agent-frontmatter hooks and transcript parsing are host-specific. A VS Code Local Stop configuration does not prove CLI/cloud plan persistence. |
| Prompt/Stop output | Do not assume `continue: false` or a VS Code hook output is honored by other harnesses; some command-hook prompt outputs are discarded. |
| Paths and patches | Normalize supported absolute/relative paths against the trusted repository root. Unknown patch shape, traversal, symlink escape, or external path must not widen scope. Current normalization is defective. |
| Branches | Bind the actual cloud PR, task, approved base and head. Do not accept arbitrary `copilot/*` branches or rename an active cloud branch to bypass policy. |
| Database | Local Compose exposes 55432; the cloud setup service exposes 5432. Ensure the agent receives a valid `DATABASE_URL`; a setup-step variable alone is not proof of persistence into its session. |
| Credentials | Host-authenticated repository reads need explicit least-privilege context. Do not export credentials into logs, issue bodies, plans, or artifacts. |

Sources inspected:
[GitHub hook reference](https://docs.github.com/en/copilot/reference/hooks-reference)
and [VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks).
Host versions and supported contracts change; recheck before presenting.

## Required post-repair canary

Run separately in CLI, VS Code Local, VS Code Agent Host if claimed, and cloud.
Retain host version/harness, exact source SHA, task digest, approved plan
identity, event names, actual branch/PR, check artifacts and the final decision.

1. Start without task input: reads remain possible and writes are denied.
2. Resolve an explicit live issue; switch to another issue and prove freshness.
3. Fail resolution and confirm no cached authority survives.
4. Produce and persist a read-only plan; prove the planner cannot write code.
5. Independently approve the immutable high-risk plan-only state.
6. Permit one in-scope edit and deny out-of-scope/unknown payloads and commands.
7. Record success and failure events without raw payloads.
8. Fail an evidence command with an old report present; readiness must fail.
9. Exercise bounded recovery and human escalation.
10. Validate the immutable result in CI; independently verify hosted controls.

These are acceptance requirements, not claimed completed results.
Host-compatibility repair is tracked by
[webmaxru/northstar-orders-api-demo#14](https://github.com/webmaxru/northstar-orders-api-demo/issues/14);
parallel task isolation by
[webmaxru/northstar-orders-api-demo#16](https://github.com/webmaxru/northstar-orders-api-demo/issues/16).
Hosted trust and repository controls are tracked by issues
[#24](https://github.com/webmaxru/northstar-orders-api-demo/issues/24) and
[#22](https://github.com/webmaxru/northstar-orders-api-demo/issues/22).
