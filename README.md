# AI Engineering System

This repository defines a practical AI engineering system for software
delivery. It turns agent-assisted development into an inspectable control loop:

> Agents propose; humans and policy accept.

The lifecycle is **plan -> act -> evaluate**. Requirements, decisions,
capabilities, evidence, and acceptance remain explicit at every stage.

This repository is intentionally **not governed by the system it describes**.
It contains the system specification and learning material, but no active agent
hooks, custom agents, or GitHub Actions implementation. Every normative system
change must first be implemented and tested in the executable reference:
[`webmaxru/northstar-orders-api-demo`](https://github.com/webmaxru/northstar-orders-api-demo).

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
| [Learning guide](docs/Developing-in-Agentic-AI-Systems-Learning-Paths.md) | Original end-to-end learning path |
| [Alignment assessment](docs/ALIGNMENT-ASSESSMENT.md) | Baseline gaps and implemented state |
| [Goals and non-goals](docs/GOALS-AND-NON-GOALS.md) | Scope and design boundaries |
| [Terminology](docs/TERMINOLOGY.md) | Canonical vocabulary |
| [Architecture](docs/ARCHITECTURE.md) | Control loop, trust model, and technology mapping |
| [Quickstart](docs/QUICKSTART.md) | Run the proof of concept and adopt the pattern |
| [End-to-end demo](docs/END-TO-END-DEMO.md) | Reproduce the complete local control loop |
| [Reference implementation](docs/REFERENCE-IMPLEMENTATION.md) | Executable artifact map and validation contract |
| [Maintaining the system](docs/MAINTAINING-THE-SYSTEM.md) | Cross-repository change and evidence workflow |
| [Agent Hooks compatibility](docs/AGENT-HOOKS-COMPATIBILITY.md) | Responsible AI Agent Hooks assessment |
| [Inert reference templates](templates/README.md) | Versioned Northstar control-plane snapshot for study |

## Run the proof of concept

```powershell
git clone https://github.com/webmaxru/northstar-orders-api-demo.git
Set-Location northstar-orders-api-demo
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
