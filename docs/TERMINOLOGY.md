# Terminology

Use these terms consistently in specifications, implementation, issues, pull
requests, and evidence.

| Term | Meaning |
| --- | --- |
| **AI engineering system** | The socio-technical system of contracts, agents, capabilities, policies, workflows, evidence, and human decisions used to deliver software with AI agents. |
| **Plan -> act -> evaluate** | The governing control loop. Planning establishes intent and authority, acting performs bounded work, and evaluation produces independent evidence. |
| **Agents propose; humans and policy accept** | The responsibility boundary. Agent output is a proposal until accountable humans and platform controls accept it. |
| **Task contract** | The canonical issue content defining inputs, outputs, success criteria, scope, constraints, non-goals, validation, rollout, and stop conditions. |
| **State anchor** | The pull request that durably connects the task, plan, decisions, commits, checks, evidence, reviews, and final disposition. |
| **Plan contract** | A machine-readable plan bound to the task-contract digest, base SHA, scope, risk, steps, required checks, evidence, rollback, and escalation. |
| **Risk floor** | The minimum `low`, `medium`, `high`, or `critical` classification derived deterministically from the capabilities and paths affected by a change. |
| **Capability boundary** | The tools, paths, commands, credentials, permissions, and external systems a role may use. |
| **Least privilege** | Granting only the capabilities needed for one role, task, phase, and duration. |
| **Pre-action control** | Authorization before a model or tool action, such as a native `PreToolUse` decision. |
| **In-action control** | Deterministic evaluation while work is in progress, primarily CI jobs and policy checks. |
| **Post-action control** | Evidence and audit production after an action or evaluation completes. |
| **Acceptance control** | Human review and platform policy that decide whether a change may merge or deploy. |
| **Evidence envelope** | A machine-readable result containing status, producer, actor, repository, pull request, base, head, run, job, and artifact digest. |
| **Execution report** | The fan-in decision built from all required evidence envelopes for one immutable change. |
| **`ready_for_review`** | Complete local reference evidence. Hosted reviews, checks, rules, or environment approvals may still be absent. |
| **`ready_for_acceptance`** | Complete hosted evidence for the immutable commit, including current human and platform acceptance. |
| **External memory** | Durable GitHub state - issues, pull requests, commits, checks, artifacts, reviews, and environment events - reloaded instead of relying on transient conversation context. |
| **Safe output** | A bounded, declared mutation that an agentic workflow may prepare or perform under explicit policy. Staged safe output records intent without mutating GitHub. |
| **Continuous AI** | Scheduled or event-driven agentic analysis that remains bounded by read-only tools, budgets, safe outputs, and deterministic acceptance controls. |
| **Validation authority** | The code and configuration that determine whether evidence is accepted. A change to its own validation authority cannot safely self-certify. |
| **Trusted publisher** | A default-branch-controlled identity that verifies evidence and publishes the stable acceptance status. |
| **Recovery** | Classifying a failure, changing the responsible layer, and evaluating again against the same task contract. |
| **Stop condition** | A condition that ends automated progress and requires human decision, such as a policy failure, security failure, repeated signature, or unknown failure. |
| **MCP governance** | Administrative control over allowed MCP servers, named tools, runtime credentials, and registry sources. |

## Terms to avoid

- Do not call generated output "approved" unless a human or platform approval
  event exists.
- Do not call a local run "accepted"; use `ready_for_review`.
- Do not describe a prompt or hook as a complete security boundary.
- Do not call a retry "recovery" unless the failure was classified and the
  responsible layer changed.
- Do not use "memory" for hidden reasoning. In this system, durable external
  memory is inspectable state.
