---
description: Plan and implement a policy-eligible lower-risk task in one pull request
name: work
argument-hint: <issue-number>
agent: implement
---

Task issue: #${input:issue}
Task role: implement
Task workflow: plan-and-execute

Read the live task and authoritative sources. This entry point is for low or
medium risk only; high/critical work must use the independent plan-first gate.

In a new local task workspace, produce a `northstar/plan/1` proposal at exactly
`artifacts/plan-proposal.md`. Before source edits, run:

`npm run plan:materialize -- --file artifacts/plan-proposal.md --execute-proposed --session-id <current-session-id>`

Use the exact `sessionId` from the active task session. The command validates
workspace ownership, scope, risk, task digest and the isolated base. It does not
approve anything. Keep this plan and the implementation in the same PR.
Publishing remains an explicitly authorized action; final review and all
applicable checks are still required.

To resume a proposal, explicitly name `Task PR: #<number>`, or a local
`Task plan: artifacts/plan.json` (or `artifacts/plan-proposal.md`). The task,
plan, branch and base ancestry are revalidated before it becomes execution
authority again. No stale cache or
arbitrary file is automatically adopted. In cloud, use the actual implementation
PR with a task-bound plan; a local file is not a substitute for that PR binding.
