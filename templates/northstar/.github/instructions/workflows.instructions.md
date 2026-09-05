---
description: Rules for GitHub Actions and Agentic Workflows
applyTo: ".github/workflows/**"
---

# Workflow rules

- Workflow changes are high risk and require plan-only human approval.
- Default permissions to `contents: read`; elevate only the job that needs a
  write permission.
- Scope concurrency by workflow and branch:
  `${{ github.workflow }}-${{ github.ref }}` or the pull-request head ref.
- Keep independent checks in parallel and use `needs` for explicit fan-in.
- Every required job emits a `northstar/check-evidence/1` record bound to the
  repository, run, actor, and tested head SHA.
- Final evidence runs with `if: always()` and treats missing, skipped,
  cancelled, failed, stale, or cross-run evidence as failure.
- Do not rename or remove required checks without updating
  `.github/governance/policy.json` and obtaining policy-owner approval.
- Pin third-party actions or use reviewed major-version tags already approved
  by the repository.
- GitHub Agentic Workflows must use strict mode, read-only agent permissions,
  bounded budgets, narrow tools, and explicit safe outputs. Commit the Markdown
  source and generated `.lock.yml` together.
- Production jobs use the protected `production` environment and non-overlap
  concurrency. Repository files cannot prove that environment reviewers are
  configured; hosted governance evidence must.
- A workflow, hook, agent, governance, script, dependency-manifest, or
  validation-config change must not self-certify. The trusted publisher first
  records `validation-authority: fail`; only a required reviewer on the
  protected `system-maintenance` environment may authorize the immutable SHA
  and replace that record.
