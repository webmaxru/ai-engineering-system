# AI Engineering System

This repository defines a practical AI engineering system for software
delivery. It turns agent-assisted development into an inspectable control loop:

> Agents propose; humans and policy accept.

The lifecycle is **plan → act → evaluate**. GitHub is the **system of record
and control plane**, and agent work is judged through the **contributor
model**. Requirements, decisions,
capabilities, evidence, and acceptance remain explicit at every stage.

[`docs/Developing-in-Agentic-AI-Systems-Learning-Paths.md`](docs/Developing-in-Agentic-AI-Systems-Learning-Paths.md)
is the non-negotiable architectural authority. The system may add a technical
measure only where that guide leaves an implementation gap, and every such
measure is recorded in
[`docs/TECHNICAL-EXTENSIONS.md`](docs/TECHNICAL-EXTENSIONS.md).

This repository is intentionally **not governed by the system it describes**.
It contains the system specification and learning material, but no active agent
hooks, custom agents, or GitHub Actions implementation. Every normative system
change must first be implemented and tested in the executable reference:
[`webmaxru/northstar-orders-api-demo`](https://github.com/webmaxru/northstar-orders-api-demo).

## Conformance release gate

`architecture-lock.json` is the release decision. A revision may be used for
adoption only when its conformance status is `conformant`, its audited Northstar
revision is `accepted`, no blocking reference change remains, and
`tools\verify-architecture.ps1` passes against that exact Northstar commit.

The current audit is **blocked**: the locked Northstar baseline contains a
required workflow that GitHub rejects before jobs start, and required repairs
are awaiting human acceptance. The design documents and local demo remain
available for inspection, but the inert snapshot must not be copied into
another repository until
[`docs/GUIDE-CONFORMANCE.md`](docs/GUIDE-CONFORMANCE.md) records restored
conformance.

## What the system provides

- GitHub issues as task contracts with inputs, outputs, success criteria,
  constraints, non-goals, validation, rollout, and stop conditions.
- Pull requests as durable state anchors for plans, decisions, handoffs,
  implementation, evidence, and acceptance.
- Machine-readable plans and deterministic
  `low`/`medium`/`high`/`critical` risk routing.
- Role-specific agents with least-privilege tools and scoped write access.
- Pre-action authorization, in-action validation, post-action evidence, and
  human/platform acceptance.
- Fan-out/fan-in evaluation across quality, build, tests, security, dependency,
  merge, policy, and review gates.
- Commit-bound evidence that rejects missing, failed, stale, cross-run, or
  cross-commit results.
- Bounded recovery that distinguishes reasoning, tool, context, conflict,
  policy, security, and environment failures.
- Bounded **Continuous AI** through read-only analysis and staged safe outputs.
- Explicit MCP server, tool, credential, and registry governance.
- An external trust boundary for changes that modify their own validation
  authority.

## Documentation

| Resource | Purpose |
| --- | --- |
| [Learning guide](docs/Developing-in-Agentic-AI-Systems-Learning-Paths.md) | Non-negotiable architectural authority |
| [Guide conformance](docs/GUIDE-CONFORMANCE.md) | Requirement-by-requirement audit of the framework and reference |
| [Technical extensions](docs/TECHNICAL-EXTENSIONS.md) | Audited register of compatible implementation choices not prescribed by the guide |
| [Architecture lock](architecture-lock.json) | Audited guide hash and reference commit |
| [Alignment assessment](docs/ALIGNMENT-ASSESSMENT.md) | Baseline gaps and implemented state |
| [Goals and non-goals](docs/GOALS-AND-NON-GOALS.md) | Scope and design boundaries |
| [Terminology](docs/TERMINOLOGY.md) | Canonical vocabulary |
| [Architecture](docs/ARCHITECTURE.md) | Control loop, trust model, and technology mapping |
| [Adoption quickstart](docs/QUICKSTART.md) | Apply the system to any existing GitHub project |
| [Reference walkthrough](docs/REFERENCE-WALKTHROUGH.md) | Run and inspect the Northstar proof of concept |
| [End-to-end demo](docs/END-TO-END-DEMO.md) | Reproduce the complete local control loop |
| [Reference implementation](docs/REFERENCE-IMPLEMENTATION.md) | Executable artifact map and validation contract |
| [Maintaining the system](docs/MAINTAINING-THE-SYSTEM.md) | Cross-repository change and evidence workflow |
| [Agent Hooks compatibility](docs/AGENT-HOOKS-COMPATIBILITY.md) | Responsible AI Agent Hooks assessment |
| [Inert reference templates](templates/README.md) | Versioned Northstar control-plane snapshot for study |

## Run the proof of concept

```powershell
git clone https://github.com/webmaxru/northstar-orders-api-demo.git
Set-Location northstar-orders-api-demo
git switch --detach <accepted-northstar-commit>
npm ci
npm run db:up
npm run demo:system
```

The expected local decision is `ready_for_review`. Only real hosted workflow
runs, current human reviews, repository rules, and protected-environment
approvals may produce `ready_for_acceptance`.

## Repository relationship

This repository answers **what the system is and why it is designed this way**.
Northstar answers **whether the system works end to end**.

A documentation-only change may remain local to this repository only when it
does not alter behavior, terminology, controls, required evidence, or an
adoption instruction. Every other change is incomplete until its Northstar
implementation and evidence are linked.

Validate the guide lock, extension register, non-self-governance boundary, and
Northstar snapshot with:

```powershell
pwsh -File tools\verify-architecture.ps1
```
