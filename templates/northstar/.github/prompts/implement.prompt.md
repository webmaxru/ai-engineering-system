---
description: Implement the approved plan for a GitHub issue
name: implement
argument-hint: <issue-number>
agent: implement
---

Task issue: #${input:issue}

The `UserPromptSubmit` hook reads that issue, caches the contract at
`artifacts/task-contract.json` and the approved plan at
`artifacts/task-plan.md` plus `artifacts/plan.json`, and stops the turn if no
number was given.

Implement only what the cached plan describes. If `artifacts/task-plan.md` is
absent, stop: plan first, in its own session. Do not re-plan here - silently
improving an approved plan turns a reviewed artifact back into an unreviewed
one.

The rest of the rules live in `AGENTS.md` and the `implement` agent profile.
