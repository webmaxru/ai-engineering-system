# Copilot execution surfaces

The authority remains
[Developing-in-Agentic-AI-Systems-Learning-Paths.md](Developing-in-Agentic-AI-Systems-Learning-Paths.md).
The same instructions or hook file do not prove equivalent execution across
hosts. The baseline matrix records observations on 2026-09-23; the follow-up
section records current candidate evidence as of 2026-09-28. Neither is a
support promise.

## Evidence matrix

Historically audited Northstar `main` baseline:
`b65c2de5c8224342c72c37eeed7ef9f965ad8a2c`. The inert snapshot now follows
candidate PR #27 at `bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7`; it remains
known-defective and is not an adoption release.

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

## Current follow-up evidence (2026-09-30)

| Surface | Current evidence | Result |
| --- | --- | --- |
| Copilot CLI | Copilot CLI 1.0.90-2 ran two read-only sessions concurrently at candidate `bb767fc73a18834eebdfd20e63dd8ef9c4f28efb` in separate worktrees. Sessions `849e8c7b-b8e6-4f99-906e-c0d9b55add68` and `d5d29fd8-177c-4535-9219-6072990a7049` independently resolved Issue #16, contract `2afe7ed6…`, approved plan `d020ca88…` (PR #26, review `5362561711`), and base `2ce3cf8…`; their workspace-owner identities differed. Neither invoked tools or changed source files, and both exact owner states were released. | Pass for parallel local task resolution and state isolation only; not proof of write authorization, Stop behavior, VS Code, cloud execution, or hosted acceptance. |
| Copilot CLI task resolution | The live resolver path previously measured 55.076 seconds while `SessionStart` and `UserPromptSubmit` were configured for 20 seconds. Candidate PR #27 raises only those two bounds to 90 seconds; `PreToolUse` remains 10 seconds. A focused regression verifies these values and that the fast authorization hook remains unchanged. The official hook reference documents `timeout` as an alias for `timeoutSec`, states that command-hook timeouts are fail-open (including `preToolUse`), and gives no maximum. | Bounded local CLI resolution is evidenced. A timed-out startup hook may leave authority unresolved, and a timed-out authorization hook does not guarantee denial. Cloud canary logs show the missing artifact but not whether the startup hook failed or timed out. |
| Copilot CLI validation | Candidate PR #27 head `bfb2cbf1d0f488ced1595f100c14ed8e312bb1f7`, base `2ce3cf8a69439c22246de7d5449ce186e23bd584`: `npm run validate` passes 528 unit tests and 79 offline governance checks; isolated PostgreSQL acceptance passes 10/10; the refreshed plan gate passes. Hosted run `36748901455` evaluated this exact head. | PR #27 remains draft and unaccepted. Run `36748901455` passes plan-contract, plan-approval, scope, quality, acceptance, CodeQL, dependency review, secret scan, merge validation, and governance. `repository-controls`, `human-review`, and `evidence` fail; `validation-authority` was not run. The report is `review_required` with 9/10 criteria proven (AC1–AC8 and AC10); AC9 is unproven. Trusted current-run revalidation is missing for plan approval, repository controls, and human review. A later owner-bound local edit preflight was denied because `plan.json` lacks an approval envelope, although `approved-plan.json` has the exact PR #26 approval and GitHub still reports review `5362561711` on plan head `42721d4…`; `authorize-tool.mjs` currently evaluates only `plan.json`. The documented `Task PR: #27` selector also is not recognized by the task-invocation/role parser. No code was edited and the guard was not bypassed. Full `validate:all` at this head fails on 83 Zizmor findings (19 `artipacked`, 61 `unpinned-uses`, one each `dangerous-triggers`, `obfuscation`, and `template-injection`). |
| VS Code | The running VS Code window did not expose an actionable accessibility tree or screenshot, and no live Local/Agent Host session was completed. | Unverified. |
| Copilot cloud | Two live read-only `gh agent-task` canaries completed: Issue #16 session `26c6b1b9-9f6f-43f7-81bc-e457b915b440` / draft PR #30 used base `bb767fc…`; Issue #24 session `12ec3302-9b64-473f-9339-1a9b844637ef` / draft PR #32 used the same Issue #16 base and is not valid Issue #24 evidence. Both logs state `artifacts/task-contract.json` was absent, and neither changed source files. Earlier WI-1842 PR #13 stopped on the same missing contract; PR #29 used `main` and made no source changes. | Cloud task/plan authority remains unverified; no cloud plan, implementation, or parallel-isolation pass. The missing artifact is a bootstrap failure, not evidence of an OAuth or repository-permission denial. |
| GitHub.com agent UI | Earlier session [5724baed-e173-4722-95ae-077e90c39c6a](https://github.com/webmaxru/northstar-orders-api-demo/tasks/5724baed-e173-4722-95ae-077e90c39c6a) had the wrong workspace branch. Session [0621d3a5-e662-47f5-b737-bdca4dbe01c4](https://github.com/webmaxru/northstar-orders-api-demo/tasks/0621d3a5-e662-47f5-b737-bdca4dbe01c4) used `/plan 16`, the custom `plan` agent, and base `agent/implement/aes-surface-evidence` at `17e7a5c5f1fbf88a92351043c675f555f4c7f04f`. After the issue body was supplied, it produced a chat-only proposal with unresolved `contractDigest` because no task-contract artifact was resolved and the planner had no shell. The proposal is not publishable or approved. Its assertion that PR #26 approval was stale is contradicted by the current approved PR #26 head `42721d4e…`, base `2ce3cf8…`, and review `5362561711`. No successful cloud plan → act → evaluate sequence or `ready_for_acceptance` decision has been recorded. | The historical session does not establish task-contract binding; do not use its proposal or the earlier session on `main` as task evidence. |
| Issue #14 staged AC15 / PR #18 | Northstar candidate head `2ce3cf8a…` passes local validation (489 unit tests), disposable PostgreSQL acceptance (9/9), high-level audit (0 vulnerabilities), and Agentic Workflow compilation. Exact native review `5356731352` is APPROVED. | Hosted report `36610256698` is `ready_for_review` with AC15 unverified; `human-review` still fails because GitHub reports `reviewDecision` as not `APPROVED`, repository-controls returns HTTP 403, and trusted acceptance fails. No merge or acceptance. |
| Issue #24 stacked-base plan | PR #25 head `7d0a78d8…` binds contract `93a40b20…` to parent base `2ce3cf8…` and plan digest `101fca8e…`; `vibeprogrammer` approved that exact plan head (review `5357419226`). PR #28 is rebased and pushed at `35ac9115…`; local plan, scope, and merge checks pass. | PR #28 remains draft. Hosted run `36635911460` fails `human-review` and `repository-controls`; local `validate:all` remains blocked by 79 repository-wide Zizmor findings. No merge or acceptance. |
| Hosted candidate gates | PR #15's current `plan-approval` passes for the approved AC15 plan, while `scope-policy`, `evidence`, and `repository-controls` fail. PR #21 head `6795e32…` has exact-head approval and passing `plan-approval`/`human-review`, but `evidence` and `repository-controls` fail. PR #19 at `cf762216…` remains draft with passing `human-review` and failing `repository-controls`. PR #27 run `36748901455` at `bfb2cbf…` fails `repository-controls`, `human-review`, and `evidence`; `validation-authority` did not run. PR #28 remains blocked by hosted controls. | No candidate has `ready_for_acceptance`; native review approval does not override failed plan, evidence, or repository-control gates. |

The latest `npm run validate:all` attempt for PR #27 was at `bfb2cbf…` and
failed at Zizmor with 83 unsuppressed findings. Issue #20 and its refreshed
plan are reopened, but no
scanner findings were fixed. Issue #22 and its plan are also reopened; no
ruleset setting was changed. No permissions, secrets, or protected environment
settings were changed to make any check pass.

### Owner-bound local task startup follow-up (2026-09-30)

The existing `northstar-pr27` worktree is on the canonical
`agent/implement/aes-parallel-isolation` branch and its task-session and owner
records bind Issue #16, PR #27, the current approved plan, and the current
coordinator session. The GitHub review is independently confirmed: PR #26 head
`42721d4ee34a55cb031567d3942dd037e5bbe513` has native APPROVED review
`5362561711`, and PR #27 remains based on `2ce3cf8a…`.

The local authorization failure is a cache mismatch, not an OAuth or missing
GitHub approval: `artifacts/approved-plan.json` includes that exact review and
plan digest, but `artifacts/plan.json` does not include the approval envelope.
`scripts/authorize-tool.mjs` evaluates the latter file only, so an exact
in-scope edit request is denied with “no human-approved machine-readable plan
authorizes writes.” Separately, the code parses `Task PR: #27` as a PR input
but `isTaskInvocation` and `taskRole` do not recognize it as a task/implementer
selector. No source edit or test was made, and no task-state, permission,
secret, or ruleset workaround was attempted. The path to a valid fix is to
re-establish the exact approved plan state through the repository resolver and
then repair/test the selector and approval-cache contract under an authorized
session; until then local writes and AC9 remain blocked.

## Host differences that need explicit adaptation

| Boundary | Required interpretation |
| --- | --- |
| Event names and JSON | Current docs describe PascalCase compatibility and snake_case payloads. Test actual event envelopes, tool names, argument shapes, and result fields; filename discovery alone is insufficient. |
| Commands and timeout | The hook reference documents `timeout` as an alias for `timeoutSec` and gives a 30-second default, but does not specify a maximum. Command-hook timeouts are fail-open, including `preToolUse`. Candidate Northstar CLI execution accepted a 90-second task-resolution budget; test nonzero exit, timeout, malformed JSON, missing executable, and every claimed host separately. |
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
