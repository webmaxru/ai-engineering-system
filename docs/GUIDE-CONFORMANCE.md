# Guide conformance

This document records the strict architecture audit of the AI engineering
system against
[`Developing-in-Agentic-AI-Systems-Learning-Paths.md`](Developing-in-Agentic-AI-Systems-Learning-Paths.md).
The guide is the non-negotiable authority; this document reports conformance
and cannot override it.

## Audit identity

| Item | Audited value |
| --- | --- |
| Audit date | 2026-09-05 |
| Canonical-text guide SHA-256 | `c247b45ed53bb7b901954611c3bc03a37294d9adfb02a6542d71522f694f62be` |
| Framework baseline | `webmaxru/ai-engineering-system@c022f617d6dad67a610e93f29f017d345d5b7edb` plus the alignment changes documented here |
| Audited reference baseline | `webmaxru/northstar-orders-api-demo@703ac2911b32d49ddab369140b877f35cf5d4c32`; known defective because GitHub rejects `governed-change.yml` before jobs start |
| Validated reference repair | [`webmaxru/northstar-orders-api-demo#7`](https://github.com/webmaxru/northstar-orders-api-demo/pull/7) at `82ae863bda42b7bed536296a77fe0d415b6686fc`; local decision `ready_for_review`, human acceptance pending |
| Required workflow repair | Issue [`webmaxru/northstar-orders-api-demo#8`](https://github.com/webmaxru/northstar-orders-api-demo/issues/8); Plan Gate-passing plan in [`webmaxru/northstar-orders-api-demo#9`](https://github.com/webmaxru/northstar-orders-api-demo/pull/9), human plan approval and implementation pending |
| Current conformance decision | **Blocked** until both required reference repairs are accepted on Northstar `main`, the snapshot is refreshed, and hosted GitHub starts the repaired workflow |
| Experimental comparison | `reference/ai-engineering-system-agent-hooks@cbb22f1e90f8edcce8e019c4c867af8daebe7605` |

A change to the guide content or hash invalidates this conclusion until the
framework and reference are audited again.

`architecture-lock.json` records this identity and intentionally blocks a
successful release verification while required reference changes remain
pending. Run `pwsh -File tools/verify-architecture.ps1` to check the guide,
extension coverage, non-self-governance boundary, one-way Northstar reference,
snapshot, and conformance decision.

The baseline reference contains the intended control-plane design, but it is
not an acceptable release: GitHub rejects the required governed-change
workflow because its `DATABASE_URL` value is invalid YAML. The strict audit
also found that its active instructions did not consistently name
**contributor model**, **MCP allow list**, and the paired **system of record and
control plane**. Pull request
[`webmaxru/northstar-orders-api-demo#7`](https://github.com/webmaxru/northstar-orders-api-demo/pull/7)
repairs those terms and adds focused tests. Its local evidence proves all three
criteria with 212 unit tests and 8 PostgreSQL acceptance tests, but the change
is not described as accepted until a human review and hosted checks apply to
the immutable commit.

`webmaxru/northstar-orders-api-demo#8` and plan-only
`webmaxru/northstar-orders-api-demo#9` isolate the workflow repair as a
separate high-risk validation-authority change. The framework snapshot must not be
copied into another project until that repair is implemented, accepted, and
included in the locked Northstar commit.

## Interpretation rules

The guide contains requirements, choice-based designs, conditional
technologies, recommendations, and examples. Strict conformance means:

- **Required** architecture is implemented without contradiction or
  substitution.
- **Choice-based** guidance keeps the guide's valid alternatives and records
  which alternative is used for each risk class.
- **Conditional** technology is required when the corresponding capability is
  enabled; it is not forced into repositories that do not use that capability.
- **Recommended** guidance is explicitly identified and may be adopted when it
  fits the repository; adopting it does not turn the recommendation into a
  universal guide requirement.
- **Examples** demonstrate a valid shape but do not freeze owner names, action
  versions, labels, file contents, or command syntax unless the surrounding
  text makes them mandatory.
- A stricter mechanism is acceptable only when it preserves the guide-defined
  behavior and is registered in
  [`TECHNICAL-EXTENSIONS.md`](TECHNICAL-EXTENSIONS.md).

Status values in this audit:

- **Conformant** - the source implementation matches the guide requirement.
- **Conformant + extension** - the guide requirement is present and a
  documented mechanism makes it concrete or stricter.
- **Choice applied** - Northstar selects one of the guide's supported patterns.
- **Recommended / adopted** - Northstar adopts a guide recommendation without
  representing it as mandatory architecture.
- **Conditional / not applicable** - the guide requires the behavior only when
  a capability is used, and Northstar does not use that variant.
- **Blocked** - source or hosted evidence exposes a defect that prevents the
  reference from supporting the conformance claim.
- **Hosted not verified** - source expresses the required control, but only
  live GitHub state can prove enforcement.

## Requirement matrix

| Guide basis | Guide architecture and terminology | Framework and Northstar implementation | Status | Extension |
| --- | --- | --- | --- | --- |
| Unit 1 and Unit 3, lines 34-58 and 138-210 | **plan → act → evaluate** is a visible loop; evaluation uses system signals rather than confidence | The architecture, task/plan flow, implementation branch, fan-out checks, execution report, and demo expose all three phases and repeat through bounded recovery | Conformant | EXT-006, EXT-010 |
| Unit 4, lines 212-288 | GitHub is the **system of record and control plane** | Issues, pull requests, commits, reviews, workflows, checks, CODEOWNERS, rulesets, and environments own durable state and enforcement; conversations are not authority | Conformant; hosted enforcement not verified | EXT-013, EXT-018 |
| Unit 5 and Unit 6, lines 307-430 | Humans remain accountable and agent work is evaluated through the **contributor model** | Agents may plan, implement, and review, but cannot accept their own output; pull requests are evaluated for intent, scope, evidence, ownership, policy, and fallback | Conformant; live review evidence not verified | EXT-006, EXT-007 |
| Unit 2, lines 508-533 and 2296-2326 | Agents have narrow SDLC responsibilities and bounded scopes | Planner, implementer, dependency, security-reviewer, and risk-reviewer roles have distinct tools, instructions, and handoffs | Conformant | EXT-004 |
| Unit 3 and Unit 5, lines 553-624 and 3454-3598 | A **task contract** defines inputs, outputs, scope, constraints, and observable **success criteria** | A trusted live `agent-task` issue is parsed into a versioned contract; success criteria map to stable tests and evidence | Conformant + extension | EXT-001 |
| Unit 4 and Unit 5, lines 635-867 | Planning, execution, and validation are separated; use a **plan-first workflow** or **plan + execution workflow** based on risk; planning is read-only | Northstar uses plan-first with plan-only approval for high/critical work and permits plan + execution for lower risk; the planning agent has read/search only | Choice applied | EXT-001, EXT-003 |
| Unit 2 and Unit 4, lines 3835-3967 and 4165-4223 | **Risk-based autonomy** is required; the guide recommends low, medium, high, and critical classifications and stronger controls at higher-impact boundaries | Northstar adopts the four-level model. Path and operation policy determines required checks and approvals; production, secrets, workflows, infrastructure, migrations, and validation controls receive higher gates | Required concept conformant; recommended model adopted + extension | EXT-002 |
| Unit 4, Unit 5, and Unit 7, lines 244-278, 1196-1200, and 3998-4307 | Required reviews, required checks, CODEOWNERS, rulesets or branch protection, environments, explicit permissions, and **least privilege** constrain work | Source policy, workflows, CODEOWNERS, role toolsets, protected-environment design, and GitHub App permission boundaries implement the model | Conformant; hosted settings not verified | EXT-004, EXT-008, EXT-009 |
| Unit 7 and Unit 4, lines 1145-1183, 1748-1836, 2893-2907, and 4048-4070 | Hooks provide pre-action blocking, post-action/error logging, and human escalation; custom agents declare tools, instructions, and handoffs | Native hooks cover session/task resolution, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, session end, and role-specific stop gates; agent frontmatter declares tools and handoffs | Conformant + extension | EXT-004, EXT-005 |
| Unit 6, Unit 7, and workflow units, lines 916-1100, 1334-1441, 1915-1980, and 2365-2591 | GitHub Actions expose triggers, contexts, outputs, permissions, concurrency, orchestration, logs, and artifacts | The intended deterministic workflows use explicit permissions, event guards, fan-out/fan-in, artifact handoffs, and workflow/branch concurrency, but the locked `governed-change.yml` is rejected by GitHub before jobs start | **Blocked** pending `webmaxru/northstar-orders-api-demo#8` and `webmaxru/northstar-orders-api-demo#9` | EXT-006, EXT-011 |
| Unit 5, Unit 6, and Unit 7, lines 340-373, 1016-1094, 2708-2816, and 4338-4392 | Meaningful actions produce attributable, run- and commit-linked **workflow outputs and artifacts**; missing evidence is failure | Producer evidence is bound to immutable state and strict fan-in fails on absent or mismatched results; pull requests and reports record decisions and handoffs | Conformant + extension | EXT-005, EXT-006 |
| Memory and continuity units, lines 3088-3439 | Issues, pull requests, documents, workflow outputs, logs, and artifacts form external memory and a durable **source of truth** | Task state is reloaded from the live issue, approved plan, pull request, commit, run, and evidence; fixtures and chat cannot authorize work | Conformant + extension | EXT-001, EXT-018 |
| Security units, lines 259-278, 402-413, 1127-1145, and 4038-4048 | Code scanning, dependency signals, secret scanning, push protection, protected secrets, and environment approvals remain blocking signals | CodeQL/SARIF, dependency audit, secret checks, environment design, and fail-closed evidence are present; source never treats a green unit suite as complete security evidence | Conformant; hosted security settings not verified | EXT-008, EXT-015 |
| MCP units, lines 1103-1145 and 1447-1691 | MCP servers expand capability and must be governed through registries and organization/enterprise **allow lists** with bounded tools and protected credentials | Policy requires approved registries and an MCP allow list; Northstar's local gh-aw adapter exposes named tools only and stores no credentials | Conformant in source; hosted registry/allow list policy not verified | EXT-014 |
| Agentic Workflow units, lines 1260-1274, 1349-1441, and 2365-2591 | GitHub Agentic Workflows express bounded intent in Markdown, compile to a lock workflow, use explicit triggers/tools/permissions/safe outputs, and augment rather than replace CI/CD | Daily Repository Status uses Markdown frontmatter, a pinned compiled lock, read-only GitHub tools, one AI-credit budget, and staged safe output; deterministic CI remains authoritative | Conformant; hosted execution not verified | EXT-011 |
| Reliability units, lines 1052-1076, 1183-1200, 2047-2108, 2834-2881, and 4432-4447 | Recovery uses **bounded retries**, rollback, and human escalation; policy and security failures are not retried away | Failures are classified, identical required failures stop after two occurrences, all attempts are capped, and rollback/escalation are recorded | Conformant + extension | EXT-010 |
| Governance units, lines 3822-3967 and 4412-4457 | Governance is continuous; the guide recommends weekly review of failures, monthly review of permissions and secret scopes, and quarterly review of rules, ownership, environments, retention, and evidence | Northstar adopts that cadence in desired policy; a scheduled governance workflow and live audit implement the review | Recommended / adopted; recurring hosted runs not verified | EXT-009 |

## Named technology disposition

| Guide-named technology or feature | Northstar disposition |
| --- | --- |
| GitHub Issues, branches, commits, pull requests, reviews | Implemented |
| Required checks, CODEOWNERS, rulesets or branch protection | Source policy implemented; live enforcement not verified |
| Protected environments and required reviewers | Source workflows and policy implemented; live configuration not verified |
| GitHub Actions triggers, contexts, outputs, permissions, concurrency, artifacts | Intended design implemented, but the required governed-change workflow is currently blocked by invalid YAML |
| CodeQL/SARIF, dependency signals, secret scanning, push protection | CodeQL/SARIF and dependency/source checks implemented; hosted secret scanning and push protection not verified |
| GitHub Copilot agents, Copilot CLI hooks, prompts, instructions, handoffs | Implemented |
| GitHub Agentic Workflows / Continuous AI / `gh-aw` | Implemented and locally compiled/audited; hosted execution not verified |
| MCP servers, registry, MCP allow list, GitHub MCP server | Policy and bounded tools implemented; organization/enterprise registry and allow list settings not verified |
| `GITHUB_TOKEN` and GitHub App tokens | Explicitly scoped in workflows; live App installation and permission state not verified |
| Personal access tokens | Not used by the canonical reference |
| Custom MCP Registry v0.1 or Azure API Center registry | Conditional option not used by Northstar |

## Example handling

The reference does not treat illustrative snippets as universal requirements.
In particular:

- action versions from guide snippets are not frozen requirements;
- sample CODEOWNERS entries, labels, titles, and reviewer names are replaced
  with repository-specific values;
- the example `plan-gate.yml` and pull-request template are implemented with
  equivalent, stricter contracts rather than copied as the only valid shape;
- the `gh agent-task` and Copilot CLI command examples remain operational
  examples, not required system interfaces;
- custom MCP registry hosting and Azure API Center remain optional because
  Northstar does not operate a custom registry.

## Gap-filling implementation disposition

The audit records each identified non-guide implementation in
[`TECHNICAL-EXTENSIONS.md`](TECHNICAL-EXTENSIONS.md). The register covers:

- versioned contracts, digests, risk floors, branch conventions, and exact
  pre-tool authorization;
- payload-minimized hook records, evidence envelopes, readiness states,
  validation authority, trusted publication, identity separation, and
  maintenance manifests;
- governance drift queries, failure signatures, the reference toolchain,
  supplemental scanners, and merge validation;
- the PostgreSQL proving workload, repository separation, single README
  reference, inert snapshot locking, controlled bootstrap, MCP adapter,
  instruction synchronization, and the Agent Hooks experiment.

No extension replaces a guide-required GitHub control. When a source file can
only describe a hosted setting, the corresponding status remains **hosted not
verified**. `architecture-lock.json` provides machine-readable extension
coverage; semantic completeness still requires human architecture review.

## Current hosted evidence boundary

The following claims require live GitHub evidence and are not established by
the repository snapshot alone:

- ruleset or branch-protection enforcement and required status bindings;
- current CODEOWNERS review enforcement;
- protected-environment reviewers, branch restrictions, self-review
  prevention, and administrator-bypass settings;
- GitHub App installation IDs, permissions, identity separation, and private
  key locations;
- secret scanning and push protection enablement;
- current pull-request reviews and immutable-head status;
- workflow run provenance, artifact retention, and the stable
  `trusted-acceptance` status;
- organization or enterprise MCP registry and allow list policy;
- successful hosted execution of the compiled Continuous AI workflow.

These controls must be reported as **not verified** until the corresponding
GitHub API query or workflow run supplies direct evidence.

## Audit conclusion

The architecture has no identified conceptual conflict with the guide, selects
guide-supported choices by risk, distinguishes adopted recommendations, and
keeps conditional technologies conditional. No guide requirement is
intentionally replaced.

The current release is nevertheless **not conformant** because the locked
Northstar snapshot contains a required workflow that GitHub cannot parse, and
the terminology repair has not received human acceptance. The architecture
lock therefore fails closed. Conformance may be restored only after both
repairs are accepted on Northstar `main`, the inert snapshot and locks are
refreshed to that exact commit, complete local validation passes, and a hosted
pull-request run proves that governed-change jobs start.
