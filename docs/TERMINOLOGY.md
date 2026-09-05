# Terminology

Use
[`Developing-in-Agentic-AI-Systems-Learning-Paths.md`](Developing-in-Agentic-AI-Systems-Learning-Paths.md)
terms exactly. Local shorthand is permitted only when its provenance is
explicit and it does not replace a guide concept.

| Term | Provenance | Meaning |
| --- | --- | --- |
| **AI engineering system** | Guide | The socio-technical system of contracts, agents, capabilities, policies, workflows, evidence, and human decisions used to deliver software with AI agents. |
| **plan → act → evaluate** | Guide | The governing loop. Planning makes the approach visible, acting performs bounded work, and evaluation uses system signals to decide whether another cycle or human action is required. |
| **system of record** | Guide | GitHub's durable issues, pull requests, commits, reviews, workflow runs, logs, and artifacts that record proposed and evaluated work. |
| **control plane** | Guide | GitHub controls such as required checks, reviews, CODEOWNERS, rulesets or branch protection, environments, permissions, and security signals that constrain acceptance. |
| **contributor model** | Guide | Evaluate agent-generated work by the same workflow standards as any contribution: intent, scope, evidence, ownership, policy, and fallback. |
| **Agents propose; humans and policy accept** | Guide | Agents may prepare work and open a pull request; accountable humans and repository policy decide whether it merges or deploys. |
| **Task contract** | Guide | The durable inputs, outputs, success criteria, scope, constraints, validation expectations, rollback, and escalation for one task. Northstar chooses a trusted live issue as its source. |
| **Success criteria** | Guide | Observable conditions mapped to workflow, test, security, or review signals rather than narrative confidence. |
| **State anchor** | Guide | The pull request that durably connects the task, plan, decisions, commits, checks, evidence, reviews, and final disposition. |
| **Source of truth** | Guide | The single authoritative durable artifact for a kind of state; transient conversation context is not authoritative. |
| **External memory** | Guide | Durable GitHub state, including issues, pull requests, documentation, workflow outputs, logs, and artifacts, reloaded across sessions and tools. |
| **Risk-based autonomy** | Guide | Autonomy bounded by impact and reversibility using low, medium, high, and critical risk classifications. |
| **Capability boundary** | Guide | The allowed tools, paths, actions, credentials, permissions, and external systems for a role and phase. |
| **Least privilege** | Guide | Grant only the capabilities required for one role, task, phase, and duration. |
| **Pre-action constraints** | Guide | Permissions, tool allow lists, and pre-tool hooks that authorize or block an action before it occurs. |
| **In-action validation** | Guide | Checks that evaluate work while it executes in the controlled workflow. |
| **Post-action traceability** | Guide | Logs, workflow outputs, artifacts, and hook records that make completed actions inspectable. |
| **Workflow outputs and artifacts** | Guide | Durable, run-linked evidence used for coordination, review, debugging, and audits. |
| **Safe output** | Guide | A declared, bounded mutation an agentic workflow may propose or perform under policy. |
| **Continuous AI** | Guide | GitHub Agentic Workflows that augment, rather than replace, deterministic CI/CD with bounded agentic automation. |
| **Bounded retries** | Guide | A finite retry policy that stops repeated failure and hands control to a human. |
| **Rollback** | Guide | A prepared way to reverse or abandon unsafe work. |
| **Escalation** | Guide | A handoff to an accountable human when risk, policy, security, repeated failure, or ambiguity exceeds the automation boundary. |
| **MCP servers, registries, and allow lists** | Guide | The capability, discovery, and organization/enterprise policy layers that determine which MCP integrations may be used. |
| **Plan contract** | [EXT-001](TECHNICAL-EXTENSIONS.md#ext-001---versioned-contracts-and-digest-binding) | Northstar's versioned machine-readable plan bound to the task-contract digest, base SHA, scope, risk, steps, checks, evidence, rollback, and escalation. |
| **Risk floor** | [EXT-002](TECHNICAL-EXTENSIONS.md#ext-002---deterministic-risk-floors) | The minimum risk classification derived from affected paths and capabilities; narrative assessment may raise but not lower it. |
| **Evidence envelope** | [EXT-006](TECHNICAL-EXTENSIONS.md#ext-006---evidence-envelopes-and-readiness-decisions) | A versioned producer result bound to actor, repository, pull request, base, head, workflow, run, job, status, and artifact digest. |
| **Execution report** | [EXT-006](TECHNICAL-EXTENSIONS.md#ext-006---evidence-envelopes-and-readiness-decisions) | The strict fan-in decision built from all required evidence for one immutable change. |
| **`ready_for_review`** | [EXT-006](TECHNICAL-EXTENSIONS.md#ext-006---evidence-envelopes-and-readiness-decisions) | Complete local reference evidence; hosted reviews, checks, rules, or environment approvals may still be absent. |
| **`ready_for_acceptance`** | [EXT-006](TECHNICAL-EXTENSIONS.md#ext-006---evidence-envelopes-and-readiness-decisions) | Complete hosted evidence for the immutable commit, including current human and platform acceptance. |
| **Validation authority** | [EXT-007](TECHNICAL-EXTENSIONS.md#ext-007---trusted-publication-and-validation-authority-maintenance) | The code and configuration that decide whether evidence is accepted; a change to that authority cannot safely certify itself. |
| **Trusted publisher** | [EXT-007](TECHNICAL-EXTENSIONS.md#ext-007---trusted-publication-and-validation-authority-maintenance) | A default-branch-controlled identity that revalidates evidence and publishes the stable acceptance status. |
| **Failure signature** | [EXT-010](TECHNICAL-EXTENSIONS.md#ext-010---failure-signature-repair-budget) | A normalized digest used to detect repetition within the bounded-retry policy. |

## Terms to avoid

- Do not call generated output "approved" unless a human or platform approval
  event exists.
- Do not call a local run "accepted"; use `ready_for_review`.
- Do not describe a prompt or hook as a complete security boundary.
- Do not call a retry "recovery" unless the failure was classified and the
  responsible layer changed.
- Do not use "memory" for hidden reasoning. In this system, durable external
  memory is inspectable GitHub state.
- Do not call an extension guide-defined merely because it is useful or
  security-enhancing.
