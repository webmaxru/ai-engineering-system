# Alignment assessment

This assessment compares the original Northstar repository with the system
described by the non-negotiable
[`Developing-in-Agentic-AI-Systems-Learning-Paths.md`](Developing-in-Agentic-AI-Systems-Learning-Paths.md)
and records the resulting reference state.
The current requirement-by-requirement audit is maintained in
[`GUIDE-CONFORMANCE.md`](GUIDE-CONFORMANCE.md); this document preserves the
historical before-and-after assessment.

**Current evidence supersedes the historical "implemented" column below.**
See [AUDIT-2026-09-23.md](AUDIT-2026-09-23.md) for the 35-script review and
actual local/cloud results. Presence in source is not operational conformance.

## Baseline assessment

The starting repository had a sound application example and useful agent
building blocks, but it was not a complete AI engineering system.

| Guide capability | Starting state | Implemented reference |
| --- | --- | --- |
| Plan → act → evaluate | Partial | Explicit phases, role handoffs, and evidence decisions |
| Issue task contract | Strong shape | Trusted provenance, digest, non-goals, validation, rollout, and stop conditions |
| Pull request as state anchor | Partial | Canonical plan, approval, commits, checks, evidence, and decisions |
| Machine-readable risk | Missing | Validated plan contract and deterministic risk floor |
| Plan approval | Misleading | Human review bound to contract, plan, base, and plan-only commit |
| Role specialization | Partial | Planner, implementer, dependency, security, and risk-review roles |
| Least privilege | Partial | Role tool lists, pre-tool denial, job-level workflow permissions, and scoped identities |
| Scope enforcement | Partial | Pre-tool path policy plus complete diff and rename checks |
| CI evaluation | Partial | Fan-out/fan-in quality, build, acceptance, dependency, secret, CodeQL, merge, governance, and review jobs |
| Evidence | Incorrectly permissive | Commit-bound producer envelopes; missing or mismatched evidence fails |
| Human acceptance | Documented only | Approval checks implemented; hosted rules remain separately verified |
| Recovery | Strong but differently named | Canonical failure taxonomy, retry budget, rollback, and escalation |
| Observability | Partial | Payload-free hook audit and commit/run/actor-bound workflow evidence |
| Workflow concurrency | Missing | Workflow-and-branch concurrency groups |
| Continuous AI | Missing | Compiled GitHub Agentic Workflow with staged safe output |
| MCP governance | Misconfigured | Fictitious endpoint removed; registry and named-tool boundary documented |
| Governance lifecycle | Missing | Weekly, monthly, and quarterly audit policy with named owners |
| Documentation accuracy | Misleading | Stale branch, PR, slide, and demo artifacts removed |

## Baseline evidence

The initial investigation established:

- 138 unit tests passed;
- 8 PostgreSQL acceptance tests passed, including concurrent retries across
  two service instances;
- dependency audit failed on vulnerable Fastify and transitive `fast-uri`
  versions;
- a historical durable evidence comment reported `PASS` while security
  evidence was absent and dependency review was failing;
- an open plan pull request was treated as approved despite having no approval
  review;
- documentation referenced remote branches that did not exist;
- the repository committed a fictitious MCP endpoint;
- the private repository plan returned HTTP 403 for branch-protection and
  ruleset APIs.

## Implemented reference state

The Northstar reference contains the intended implementation:

- trusted live issue task contracts;
- machine-readable plans and risk routing;
- digest-bound plan approval;
- dedicated implementation branches bound to the approved base;
- issue scope plus narrower plan scope;
- role-specific agents and native Copilot lifecycle hooks;
- payload-free local audit records;
- deterministic quality, build, unit, PostgreSQL acceptance, dependency,
  secret, CodeQL, merge, governance, and human-review checks;
- commit-bound evidence envelopes and strict fan-in;
- a stable trusted publisher decision;
- bounded recovery and escalation;
- an agentic status workflow with read-only tools and staged safe output;
- a protected maintenance path for changes to validation authority;
- patched dependencies with no known audit vulnerabilities at validation time.

The earlier workflow syntax and terminology defects were repaired and merged.
The September 23 audit at `b65c2de5c8224342c72c37eeed7ef9f965ad8a2c` found
new task-bootstrap, evidence-integrity, host-compatibility, scanner and recovery
defects. It also recorded two moderate dependency findings, superseding the
historical clean-audit statement above. On 2026-09-28, the owner reopened the
system-maintenance issues and PRs to resume conformance remediation. The
reference remains blocked: no maintenance candidate has been merged or
accepted, and the snapshot is refreshed for inspection, not adoption.

## Demo and reopened maintenance evidence (2026-09-28)

| Candidate | Verified local evidence | Remaining blocker |
| --- | --- | --- |
| PR #18, issue #14, head `17e7a5c5…` (reopened) | Prior independent review; hosted acceptance tests passed; candidate annotated identified customization seams | Unmerged; `evidence` and `repository-controls` failed. Fresh approval of the refreshed PR #15 plan is pending |
| PR #27, issue #16, head `fc59deef…` (reopened) | Exact-head implementation approval; 500 unit tests, 10 PostgreSQL acceptance tests, 66-path scope check and merge check passed against base `17e7a5c5…`; two read-only CLI identity canaries passed | Full `validate:all` fails on 84 Zizmor findings; hosted evidence and repository-controls fail. GitHub.com canary `5724baed…` returned `CANARY-FAIL` because active task/session authority was unavailable and workspace branch binding mismatched |
| PR #28, issue #24, head `0260fe99…` (reopened) | `vibeprogrammer` approved the exact head; hosted `human-review` and `evidence` checks passed | `repository-controls` failed; trusted acceptance was not established |
| PR #21, issue #20, head `6795e32…` (reopened plan) | Refreshed plan binds contract digest `df654e26…`, plan digest `76a25183…`, and base `17e7a5c…`; plan-contract and require-plan pass | Fresh review/plan approval, hosted evidence and repository-controls remain blocked; implementation remains blocked by issue #22 |
| PR #19, issue #17, head `cf762216…` | Issue/plan base is `17e7a5c…`; `vibeprogrammer` approved the exact head and hosted `human-review` passes; local `validate` (470 unit tests), PostgreSQL acceptance (12/12), scope and merge checks pass | Full `validate:all` fails at Zizmor (86 findings, 65 errors/21 notes); hosted `repository-controls` fails; no successful issue #17 VS Code/cloud run |
| PR #13, issue #4 WI-1842 rehearsal (closed) | The planner stopped because the cached task contract was absent; no files changed and no plan was produced | Historical blocker only; not a successful cloud run |
| PR #29, issue #16 cloud attempt (closed) | GitHub.com run created a draft PR | Wrong `main` base and zero changed files; not cloud isolation evidence |

Issues #14, #16, #20, #22 and #24 and their plan/implementation PRs have been
reopened for remediation. Their earlier closures were scope cancellations,
not fixes or acceptance. Demo issues #4 and #17 and draft PR #19 also remain
open. None supersedes the audited `main` baseline or permits adoption.

## Validation boundary

The source-controlled implementation and local proof can reach
`ready_for_review`.

Hosted `ready_for_acceptance` additionally depends on real GitHub state:

- required and current checks;
- current human reviews;
- CODEOWNERS and rulesets;
- protected environments;
- GitHub App identity and secret scope;
- secret scanning and push protection;
- retained workflow evidence.

Those controls must remain **not verified** until the platform provides direct
evidence. A policy file describing them is not proof that they are active.

## Remaining limitations at the audited baseline (2026-09-23)

- The reference is GitHub- and Copilot-oriented rather than framework-neutral.
- The current private-repository plan may prevent API verification or
  configuration of some hosted controls.
- Native Copilot hooks are defense in depth and do not expose every model and
  output lifecycle point.
- The trusted maintenance path requires one audited installation bootstrap
  before its default-branch workflow can govern later changes.
- The workflow now runs, but its examined acceptance-related jobs failed;
  the actual cloud rehearsal stopped before a plan because task authority
  was missing. See [COPILOT-SURFACES.md](COPILOT-SURFACES.md).
- The experimental Responsible AI Agent Hooks adapter is partial and
  nonconformant because the host does not expose all required lifecycle points.
