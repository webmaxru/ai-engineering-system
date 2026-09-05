---
name: Daily Repository Status
description: Produces a concise, evidence-linked repository status report.

on:
  schedule: daily
  workflow_dispatch:

engine: copilot
strict: true
max-ai-credits: 1

permissions:
  contents: read
  issues: read
  pull-requests: read
  actions: read
  copilot-requests: write

network: defaults

tools:
  github:
    mode: gh-proxy
    toolsets: [repos, issues, pull_requests, actions]

safe-outputs:
  staged: true
  create-issue:
    title-prefix: "[repo-status] "
    max: 1
    close-older-issues: true
  noop:
---

# Daily Repository Status Report

Create one concise status report covering the previous 24 hours.

Include:

- Issues opened, closed, blocked, or identified as high priority.
- Pull requests opened, merged, awaiting review, or failing required checks.
- Important commits and releases.
- Failed workflow runs, policy violations, and missing evidence.
- Key highlights, risks, and recommended next steps with GitHub links.

Separate observed facts from recommendations. Do not claim a check passed unless
GitHub reports it as successful. Do not expose secrets or raw request data.

If the reporting window contains no qualifying activity, call `noop` instead of
creating an empty report.
