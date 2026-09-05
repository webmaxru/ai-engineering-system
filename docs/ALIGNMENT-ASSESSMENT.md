# Alignment assessment

This assessment compares the original Northstar repository with the system
described by the learning guide and records the resulting reference state.

## Baseline assessment

The starting repository had a sound application example and useful agent
building blocks, but it was not a complete AI engineering system.

| Guide capability | Starting state | Implemented reference |
| --- | --- | --- |
| Plan -> act -> evaluate | Partial | Explicit phases, role handoffs, and evidence decisions |
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

The Northstar reference now contains:

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

## Remaining limitations

- The reference is GitHub- and Copilot-oriented rather than framework-neutral.
- The current private-repository plan may prevent API verification or
  configuration of some hosted controls.
- Native Copilot hooks are defense in depth and do not expose every model and
  output lifecycle point.
- The trusted maintenance path requires one audited installation bootstrap
  before its default-branch workflow can govern later changes.
- The experimental Responsible AI Agent Hooks adapter is partial and
  nonconformant because the host does not expose all required lifecycle points.
