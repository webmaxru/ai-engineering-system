---
description: Plan the task defined by a GitHub issue
name: plan
argument-hint: <issue-number>
agent: plan
---

Task issue: #${input:issue}
Task role: plan

That number is the only thing this prompt supplies. The `UserPromptSubmit` hook
reads the issue, caches the contract at `artifacts/task-contract.json`, and
clears cached authority if no number was given. Prompt-hook stop outputs
differ by host; the PreToolUse boundary denies writes without valid authority.

Everything else - what to read, what to produce, what not to touch - is in
`AGENTS.md` and the `plan` agent profile. It is not repeated here, because a
prompt that restates durable rules is a second copy of them that will drift.

End with the `northstar/plan/1` JSON contract required by
`scripts/plan-contract.mjs`.
