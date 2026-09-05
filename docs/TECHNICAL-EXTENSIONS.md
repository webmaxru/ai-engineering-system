# Technical extensions

This document is the audited register of architectural and technical measures
in the current AI engineering system that are not explicitly prescribed by
[`Developing-in-Agentic-AI-Systems-Learning-Paths.md`](Developing-in-Agentic-AI-Systems-Learning-Paths.md).

The learning guide remains authoritative. An item belongs here only when it
fills an implementation gap left by the guide. An extension may make a guide
control more concrete or stricter, but it may not replace, weaken, or
reinterpret a guide requirement.

## Classification rule

Use this order for every architecture decision:

1. If the guide requires the behavior or names the technology, implement it as
   guide conformance.
2. If the guide offers multiple valid patterns, document which pattern is used
   and why; the choice itself is not a new architecture.
3. If the guide leaves the mechanism unspecified, record the chosen mechanism
   here before describing it as part of the system.
4. If a proposal conflicts with the guide, reject or redesign it. It cannot be
   legalized as an extension.

Extension identifiers are stable. Do not renumber them when an extension is
retired.

`architecture-lock.json` carries a machine-readable mechanism-to-extension
coverage manifest. The verifier checks that every registered ID has named
mechanisms and existing evidence paths. That structural check does not prove
that reviewers noticed every new mechanism; completeness remains an explicit
architecture-review responsibility.

## Register

| ID | Extension | Scope | State |
| --- | --- | --- | --- |
| EXT-001 | Versioned contracts and digest binding | Canonical control plane | Active |
| EXT-002 | Deterministic risk floors | Canonical control plane | Active |
| EXT-003 | Plan publication and branch topology | Reference policy | Active |
| EXT-004 | Exact pre-tool authorization | Reference enforcement | Active |
| EXT-005 | Payload-minimized local audit | Reference observability | Active |
| EXT-006 | Evidence envelopes and readiness decisions | Canonical evidence model | Active |
| EXT-007 | Trusted publication and validation-authority maintenance | Hosted trust boundary | Active |
| EXT-008 | Split GitHub App identities and secret placement | Hosted identity boundary | Active |
| EXT-009 | Governance drift audit and evidence retention | Hosted/source governance | Active |
| EXT-010 | Failure-signature repair budget | Recovery | Active |
| EXT-011 | Reference validation toolchain | Reference implementation | Active |
| EXT-012 | PostgreSQL idempotency proving workload | Reference application | Active |
| EXT-013 | Framework/reference repository separation | Framework maintenance | Active |
| EXT-014 | Repository-local gh-aw MCP adapter | Reference developer tooling | Active |
| EXT-015 | Supplemental security and merge checks | Reference evaluation | Active |
| EXT-016 | Responsible AI Agent Hooks comparison | Experiment | Isolated |
| EXT-017 | Guide conformance and extension ledger | Framework maintenance | Active |
| EXT-018 | Single-source agent instructions | Reference context control | Active |
| EXT-019 | Controlled bootstrap and deferred activation | Adoption process | Active |

## EXT-001 - Versioned contracts and digest binding

**Guide gap.** The guide requires inspectable task inputs, outputs, success
criteria, plans, approvals, workflow outputs, artifacts, and traceability to a
specific run and commit. It does not prescribe one serialization format,
schema namespace, canonicalization algorithm, or tamper-evident binding
between those artifacts.

**Implementation.** Northstar uses versioned JSON records such as
`northstar/plan/1`, `northstar/check-evidence/1`, and
`northstar/execution-report/3`. SHA-256 digests bind the live issue body, plan,
base commit, approval, evidence, and maintenance manifest.

**Compatibility.** This makes the guide's traceability and source-of-truth
requirements machine-verifiable. It does not replace the issue, pull request,
workflow run, review, or human decision.

**Trust and operational effects.** A semantically changed contract is a new
contract even if its display name is unchanged. Schema evolution must be
explicit, and stale or differently serialized artifacts cannot be silently
accepted.

**Rollback.** Revert the schema change and its producer/consumer updates
together. Never accept both old and new shapes through an unbounded fallback.

**Northstar evidence.** `scripts/task-contract.mjs`,
`scripts/plan-contract.mjs`, `scripts/plan-approval.mjs`,
`scripts/evidence-record.mjs`, `scripts/build-execution-report.mjs`,
`scripts/maintenance-manifest.mjs`, and their focused unit tests.

## EXT-002 - Deterministic risk floors

**Guide gap.** The guide requires autonomy to be explicitly bounded by risk
and recommends a low, medium, high, and critical classification model. It does
not define a portable algorithm for resolving conflicts between a requested
risk level and sensitive paths or capabilities.

**Implementation.** Northstar derives a minimum risk from changed paths and
requested operations. A narrative assessment may raise risk but cannot lower
the deterministic floor.

**Compatibility.** The extension implements the required risk-based autonomy
concept, adopts the guide's recommended four-level model, and does not reduce
any approval boundary.

**Trust and operational effects.** Policy files and validation code become
high-risk because changing the classifier can change the controls applied to
future work.

**Rollback.** Revert the policy and classifier together, then re-evaluate every
open plan whose effective risk could change.

**Northstar evidence.** `.github/governance/policy.json`,
`scripts/risk-policy.mjs`, `scripts/plan-contract.mjs`, and
`tests/unit/risk-policy.test.ts`.

## EXT-003 - Plan publication and branch topology

**Guide gap.** The guide permits both plan-first and plan + execution
workflows and does not prescribe branch names, plan serialization locations,
or how a read-only planner publishes without gaining repository write access.

**Implementation.** The planner writes only a local proposal through its stop
hook. A human publishes the plan. High and critical work uses a plan-only pull
request and a separate `agent/implement/<task-id>` branch created from the
approved base SHA. Lower-risk work may use the guide's plan + execution
mode when policy allows it.

**Compatibility.** Both guide-defined workflow modes remain available.
Separating publication from planning preserves the required read-only planning
boundary.

**Trust and operational effects.** Approval binds to a plan-only commit and
cannot be reused after the plan or base changes. Exact branch names are a
Northstar convention, not a universal guide requirement.

**Rollback.** Close the implementation pull request, return to the approved
base, and republish a new plan when scope or assumptions change.

**Northstar evidence.** `.github/agents/plan.agent.md`,
`.github/agents/implement.agent.md`, `scripts/plan-stop.mjs`,
`scripts/publish-plan.mjs`, `scripts/plan-approval.mjs`, and
`.github/workflows/plan-gate.yml`.

## EXT-004 - Exact pre-tool authorization

**Guide gap.** The guide requires hooks, tool allow lists, capability limits,
path scope, and least privilege. It leaves repository-specific command grammar,
tool payload parsing, base ancestry checks, and precedence rules unspecified.

**Implementation.** Northstar's native `PreToolUse` hook resolves a trusted
live task contract and approved plan, denies shell metacharacters and
non-allowlisted command shapes, extracts paths from supported tool payloads,
checks issue and plan scope, verifies the implementation branch and approved
base ancestry, and categorically denies privileged operations.

**Compatibility.** This is a concrete, stricter implementation of the guide's
pre-action and least-privilege controls. It remains defense in depth; complete
diff checks, GitHub policy, and human acceptance are still required.

**Trust and operational effects.** Unknown commands and unknown tool payload
shapes fail closed. Hook timeout behavior supplied by the host remains a
documented platform limitation and is not represented as complete mediation.

**Rollback.** Revert policy and authorizer changes together. A failing
authorizer must be repaired through the approved control-plane maintenance
path, not bypassed by renaming or disabling hooks.

**Northstar evidence.** `.github/hooks/agent-boundary.json`,
`scripts/authorize-tool.mjs`, `scripts/check-scope.mjs`, and
`tests/unit/tool-authorization.test.ts`.

## EXT-005 - Payload-minimized local audit

**Guide gap.** The guide requires post-action/error observability and warns
against exposing secrets, but it does not define a privacy-preserving local
hook record.

**Implementation.** Northstar records actor, task, contract, plan, event, tool,
paths, outcome, and SHA-256 digests of command arguments and results. It does
not store raw prompts, request bodies, idempotency keys, commands, or tool
results in the local audit record.

**Compatibility.** The record supplies attribution and correlation while
preserving the guide's secret boundary. Durable GitHub workflow artifacts and
audit events remain the acceptance evidence.

**Trust and operational effects.** Digests support equality and correlation,
not reconstruction or proof that the hidden payload was safe.

**Rollback.** Remove or rotate local session artifacts. Do not replace the
scheme with raw payload logging.

**Northstar evidence.** `scripts/audit-hook.mjs`,
`.github/hooks/agent-boundary.json`, and
`tests/unit/audit-hook.test.ts`.

## EXT-006 - Evidence envelopes and readiness decisions

**Guide gap.** The guide requires workflow outputs, artifacts, provenance,
fan-in, and human/platform acceptance, but does not prescribe one evidence
schema or local-versus-hosted decision vocabulary.

**Implementation.** Every producer emits a versioned evidence envelope bound
to repository, pull request, base SHA, head SHA, workflow, run, job, actor, and
artifact digest. Strict fan-in rejects missing, failed, skipped, duplicate,
stale, cross-run, or cross-commit evidence. `ready_for_review` means local
proof is complete; `ready_for_acceptance` additionally requires current hosted
review and policy evidence.

**Compatibility.** The extension prevents self-reported success from replacing
the guide's system signals. Neither readiness state means that an agent
approved its own work.

**Trust and operational effects.** Producers and the fan-in consumer form part
of validation authority. Hosted evidence must be re-resolved for the immutable
head instead of copied from an earlier run.

**Rollback.** Revert producer, schema, required-check policy, and fan-in
changes together. Missing evidence remains a failure during rollback.

**Northstar evidence.** `scripts/evidence-record.mjs`,
`scripts/build-execution-report.mjs`, `scripts/check-human-review.mjs`,
`.github/workflows/governed-change.yml`, and the execution-report tests.

## EXT-007 - Trusted publication and validation-authority maintenance

**Guide gap.** The guide requires independent acceptance controls, protected
environments, workflow evidence, and human approval. It does not specify how a
pull request that changes its own evaluator avoids self-certification.

**Implementation.** Pull-request-controlled code cannot produce the stable
acceptance verdict for a validation-authority change. A default-branch
`workflow_run` publisher imports only allowlisted evidence. Control-plane
changes additionally require an immutable maintenance manifest, a protected
`system-maintenance` environment, and revalidation by default-branch code
before the stable `trusted-acceptance` status is published.

**Compatibility.** This preserves the guide's independent human and platform
acceptance boundary when the proposed change can alter its own checks.

**Trust and operational effects.** The default branch, protected environment,
reviewer, workflow definition, evidence allow list, and publisher identity are
part of the trust root. The first installation requires one explicit audited
bootstrap; it is not a reusable bypass.

**Rollback.** Revert to the last trusted default-branch publisher and policy.
Do not let pull-request code publish a substitute success status.

**Northstar evidence.** `scripts/check-validation-authority.mjs`,
`scripts/import-evidence-artifacts.mjs`,
`scripts/maintenance-manifest.mjs`,
`.github/workflows/publish-evidence.yml`, and
`.github/workflows/system-maintenance-approval.yml`.

## EXT-008 - Split GitHub App identities and secret placement

**Guide gap.** The guide names GitHub App tokens, least privilege, protected
environments, and scoped secrets, but it does not prescribe identities for
maintenance dispatch versus acceptance publication.

**Implementation.** Northstar uses separate GitHub Apps: a dispatch-only
identity that cannot publish status and a trusted-publisher identity that
cannot dispatch maintenance. Private keys are available only in explicitly
allowlisted protected environments and are forbidden as repository or
organization Actions secrets.

**Compatibility.** Splitting identities narrows capability and prevents one
credential from both initiating privileged validation and declaring its
result.

**Trust and operational effects.** App installation permissions, integration
IDs, environment branch restrictions, reviewers, and secret locations require
live GitHub verification. Repository configuration alone is not proof.

**Rollback.** Disable both App installations or revoke their keys, restore the
last known policy, and keep acceptance blocked until live identity checks pass.

**Northstar evidence.** `.github/governance/policy.json`,
`scripts/governance-audit.mjs`,
`.github/workflows/publish-evidence.yml`, and
`.github/workflows/system-maintenance-approval.yml`.

## EXT-009 - Governance drift audit and evidence retention

**Guide gap.** The guide requires continuous governance, permission reviews,
and artifact-retention awareness. It recommends weekly, monthly, and quarterly
review cadences and documents GitHub's 90-day default retention. It does not
define exact hosted queries, owner names, or a machine-readable desired-state
policy.

**Implementation.** Northstar stores desired governance in
`.github/governance/policy.json`, audits source and live repository settings,
uses named weekly/monthly/quarterly review subjects, and adopts the guide's
documented 90-day default for canonical governance/evidence artifacts.

**Compatibility.** Northstar adopts the guide's recommended cadence and
documented retention baseline. The JSON shape, exact reviewers, and API
queries are implementation choices.

**Trust and operational effects.** A source audit can verify intended policy
and workflow structure. Rulesets, environments, App installations, security
features, reviewers, variables, and secret locations remain not verified
until live API evidence succeeds.

**Rollback.** Restore the previous desired-state policy and audit code
together. Do not convert an unavailable hosted check into a pass.

**Northstar evidence.** `.github/governance/policy.json`,
`scripts/governance-audit.mjs`, `.github/workflows/governance-review.yml`, and
`tests/unit/governance-audit.test.ts`.

## EXT-010 - Failure-signature repair budget

**Guide gap.** The guide requires bounded retries, rollback, and escalation
and gives a two-failure escalation example. It does not prescribe a failure
normalization or signature algorithm.

**Implementation.** Northstar classifies the responsible failure layer,
normalizes volatile text, hashes the normalized signature, and stops
automation when the same required failure repeats or the finite attempt budget
is exhausted. Policy, security, and unknown failures escalate immediately.

**Compatibility.** This mechanizes bounded retries without treating repeated
execution as recovery.

**Trust and operational effects.** Normalization must not collapse unrelated
failures into one signature or strip information needed for diagnosis.

**Rollback.** Revert the classifier and signature logic together and retain a
finite, explicitly documented retry limit.

**Northstar evidence.** `scripts/repair-budget.mjs`,
`docs/RECOVERY-POLICY.md`, and `tests/unit/repair-budget.test.ts`.

## EXT-011 - Reference validation toolchain

**Guide gap.** The guide names GitHub Actions, CodeQL, dependency/security
signals, SARIF, and Agentic Workflows, but it does not mandate a language,
runtime version, test runner, declaration format, workflow compiler version,
or third-party workflow scanners.

**Implementation.** Northstar uses Node.js 22, ESM JavaScript control scripts,
TypeScript declaration files, Vitest, npm scripts, a pinned `gh-aw`
compilation path, and Poutine plus zizmor workflow analysis.

**Compatibility.** These tools produce or validate the guide-required signals;
they do not replace GitHub checks, reviews, or security controls.

**Trust and operational effects.** The package lock, compiler version, scanner
versions, generated lock workflow, and validation scripts are part of the
reference validation supply chain.

**Rollback.** Revert tool and lockfile changes together and rerun the complete
validation suite. A scanner unavailable in one environment must be reported as
not run, not passed.

**Northstar evidence.** `package.json`, `package-lock.json`,
`scripts/run-zizmor.mjs`, `.github/workflows/daily-repository-status.md`,
`.github/workflows/daily-repository-status.lock.yml`, and `tests/unit/`.

## EXT-012 - PostgreSQL idempotency proving workload

**Guide gap.** The guide requires observable success criteria and evidence
appropriate to the software under change, but it does not prescribe an
application domain or distributed-systems test workload.

**Implementation.** The reference is a TypeScript/Fastify Orders API whose
idempotency behavior must hold across two stateless service instances.
PostgreSQL supplies shared durability and advisory-lock-based concurrency
control. Raw idempotency keys and request payloads are not persisted or logged.

**Compatibility.** This workload makes the guide's requirement for
system-grounded evaluation concrete. It is an example, not a universal
application architecture.

**Trust and operational effects.** Unit tests cannot prove the cross-process
criterion. PostgreSQL acceptance evidence is required whenever that behavior
is in scope.

**Rollback.** Revert application and migration changes together and preserve a
cross-instance acceptance test for the behavior claimed by the reference.

**Northstar evidence.** `src/services/postgres-idempotent-order-service.ts`,
`migrations/`, `tests/acceptance/`, and the application ADRs.

## EXT-013 - Framework/reference repository separation

**Guide gap.** The guide describes governance inside software repositories but
does not prescribe how the architecture specification itself can evolve when
the current system version is defective.

**Implementation.** `webmaxru/ai-engineering-system` is a non-self-governing
specification repository. Every normative system change is first implemented
and tested in `webmaxru/northstar-orders-api-demo`. Northstar knows about the
framework through exactly one link in its root `README.md`; no instruction,
workflow, application, or test file may depend on the framework repository.
The framework keeps an inert, commit-locked snapshot under
`templates/northstar/`; potentially active instruction files are renamed,
including `AGENTS.snapshot.md`.

**Compatibility.** Northstar still demonstrates the full guide-defined system.
The split prevents framework maintenance from requiring a bypass of the
controls being redesigned.

**Trust and operational effects.** The two repositories can drift unless the
source commit, normalized file hashes, and one-way reference boundary are
checked. The snapshot is educational and never the behavioral source of truth.

**Rollback.** Restore the last lock that matches a validated Northstar commit.
Do not activate copied hooks, agents, or workflows in the framework repository.

**Evidence.** `AGENTS.md`, `docs/MAINTAINING-THE-SYSTEM.md`,
`templates/northstar/reference-lock.json`, `tools/verify-reference.ps1`,
Northstar's root `README.md`, and its context-architecture test.

## EXT-014 - Repository-local gh-aw MCP adapter

**Guide gap.** The guide requires MCP registry and allow list governance but
does not prescribe the local command adapter used to inspect or compile
GitHub Agentic Workflows.

**Implementation.** Northstar declares a local `gh aw mcp-server` adapter and
enables only the named `compile`, `audit`, `logs`, `inspect`, `status`, and
`audit-diff` tools.

**Compatibility.** The named-tool list narrows access as required by the
guide. Use remains contingent on organization or enterprise MCP policy; the
repository file does not prove registry approval.

**Trust and operational effects.** Installing or expanding the adapter changes
tool capability and is treated as a high-risk dependency and policy change.

**Rollback.** Remove the server declaration or reduce the named-tool list.
Never replace registry approval with an unrestricted local wildcard.

**Northstar evidence.** `.github/mcp.json`, `AGENTS.md`, and
`.github/governance/policy.json`.

## EXT-015 - Supplemental security and merge checks

**Guide gap.** The guide requires security signals, dependency review,
traceability, small pull requests, and current merge gates. It does not
prescribe a deterministic source secret scanner or a merge-base compatibility
algorithm.

**Implementation.** Northstar adds a payload-safe source secret scan,
merge-base validation, and rename-aware complete-diff scope checks alongside
CodeQL, dependency audit, GitHub secret scanning, push protection, and review.

**Compatibility.** These checks add signals; they do not substitute for the
guide-named hosted controls.

**Trust and operational effects.** The supplemental scanner has a narrower
claim than GitHub secret scanning. Merge validation must use the approved base
and immutable head.

**Rollback.** Remove only the supplemental check and continue to require the
guide-named security and merge controls. Report any unavailable hosted signal
as not verified.

**Northstar evidence.** `scripts/secret-scan.mjs`,
`scripts/check-merge.mjs`, `scripts/check-scope.mjs`, and their unit tests.

## EXT-016 - Responsible AI Agent Hooks comparison

**Guide gap.** The guide requires lifecycle hooks but does not require the
Responsible AI Agent Hooks project or define an adapter between that project's
eight interception points and GitHub Copilot's exposed lifecycle events.

**Implementation.** Northstar branch
`reference/ai-engineering-system-agent-hooks` contains an experimental partial
adapter and compatibility evidence. It is intentionally excluded from the
canonical `main` branch.

**Compatibility.** The project is conceptually compatible with the guide's
hook model. The current host cannot expose every required interception point,
so the branch is not presented as an equivalent or complete implementation.

**Trust and operational effects.** Adding the framework introduces another
runtime, policy representation, and adapter surface without removing the need
for GitHub-native checks and acceptance.

**Rollback.** Delete or abandon the experimental branch. Canonical operation
does not depend on it.

**Evidence.** `docs/AGENT-HOOKS-COMPATIBILITY.md` and Northstar branch
`reference/ai-engineering-system-agent-hooks`.

## EXT-017 - Guide conformance and extension ledger

**Guide gap.** The guide defines the architecture but does not prescribe how a
separate framework repository records the exact guide version audited or
prevents undocumented implementation additions.

**Implementation.** The framework makes the guide non-negotiable in
`AGENTS.md`, records the audited guide and Northstar revisions in
`architecture-lock.json`, maintains `docs/GUIDE-CONFORMANCE.md`, and requires
every non-guide mechanism to have a stable entry in this register with
compatibility, trust, rollback, and evidence. Its machine-readable extension
coverage manifest maps each extension to named mechanisms and evidence paths.
The local `tools/verify-architecture.ps1` check detects guide drift, registry
and coverage mismatches, unknown extension references, active framework
controls, reference-snapshot drift, and blocked reference changes.

**Compatibility.** The ledger cannot override the guide. It exists only to
make provenance and gap-filling decisions inspectable.

**Trust and operational effects.** A guide change invalidates the previous
conformance conclusion until both repositories are re-audited. An
unregistered implementation is nonconformant until classified. The verifier
checks ledger integrity, not semantic completeness; reviewers must identify
new mechanisms during every architecture change.

**Rollback.** Restore the previous guide and conformance record or complete a
new full audit. Do not silently preserve a conclusion derived from a different
guide version.

**Evidence.** This is non-normative framework bookkeeping rather than a
runtime Northstar feature. Its evidence is `AGENTS.md`, `architecture-lock.json`,
`tools/verify-architecture.ps1`, `docs/GUIDE-CONFORMANCE.md`, this register,
and the exact Northstar commit and evidence recorded by the conformance
assessment.

## EXT-018 - Single-source agent instructions

**Guide gap.** The guide requires consistent repository instructions and warns
against context drift, but different GitHub and IDE surfaces do not all read
the same instruction-file convention.

**Implementation.** Northstar authors repository-wide instructions once in
`AGENTS.md`, generates `.github/copilot-instructions.md` from that source, and
fails validation when the generated compatibility copy is stale.

**Compatibility.** The mechanism preserves one source of truth while making
the same constraints visible to surfaces that do not yet read `AGENTS.md`.

**Trust and operational effects.** `AGENTS.md` is authoritative. The generated
file must never be edited by hand or allowed to drift into a second policy.

**Rollback.** Restore both files from the last synchronized revision or remove
the compatibility file only after every supported surface reads `AGENTS.md`.

**Northstar evidence.** `AGENTS.md`, `.github/copilot-instructions.md`,
`scripts/sync-agent-instructions.mjs`, and the `instructions:check` validation
command.

## EXT-019 - Controlled bootstrap and deferred activation

**Guide gap.** The guide defines pre-action constraints and high-risk
governance but does not prescribe how to install those controls in a repository
that does not yet have a trusted task contract, customized paths, or validated
commands.

**Implementation.** Adoption uses a human-owned bootstrap branch, an inert
`.ai-engineering-bootstrap/` staging directory excluded through the local Git
exclude file, and a deferred hook activation step. The native hook is moved
into `.github/hooks/` only after its task, plan, path, and command policies pass
negative and positive tests. The bootstrap is a one-time installation path,
not a reusable bypass.

**Compatibility.** The process establishes the guide's constraints before
asking them to govern work. It does not relax the final hook, workflow, review,
or hosted-control boundaries.

**Trust and operational effects.** Until activation, an accountable human owns
the bootstrap diff and GitHub configuration. The staging directory is not
durable system state and must never be committed. The selected framework and
reference revisions must be immutable and verified before files are copied.

**Rollback.** Revert the audited bootstrap commit and remove only the named
staging directory. Do not preserve a hidden disable switch or rename active
controls as a normal development technique.

**Evidence.** `docs/QUICKSTART.md`, the installed Northstar control plane, and
the post-installation canary workflow described by the quickstart.
