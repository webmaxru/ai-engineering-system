---
description: Implement the approved plan for a GitHub issue
name: implement
argument-hint: <issue-number>
agent: implement
---

Task issue: #${input:issue}
Task role: implement
Task workflow: plan-first

The `UserPromptSubmit` hook reads that issue, caches the contract at
`artifacts/task-contract.json` and the approved plan at
`artifacts/task-plan.md` plus `artifacts/plan.json`. Missing or failed task
resolution clears cached authority; PreToolUse denies writes even on hosts
that ignore prompt-hook stop outputs.

Implement only what the cached plan describes. If `artifacts/task-plan.md` is
absent, stop: plan first, in its own session. Do not re-plan here - silently
improving an approved plan turns a reviewed artifact back into an unreviewed
one.

This prompt is the plan-first continuation. Use `/work <issue>` for a
policy-eligible low/medium task whose plan and implementation belong in one PR.

The rest of the rules live in `AGENTS.md` and the `implement` agent profile.
