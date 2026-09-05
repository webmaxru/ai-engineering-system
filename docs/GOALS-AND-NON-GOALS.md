# Goals and non-goals

## Goals

### Make agent-assisted delivery inspectable

The system must leave durable evidence for requirements, plans, decisions,
actions, validation, and acceptance. A reviewer should be able to reconstruct
why a change exists, what authority it had, what it changed, and what proved it.

### Separate proposal from acceptance

Agents may analyze, plan, implement, review, and prepare bounded outputs.
Humans and platform policy remain the acceptance authority for merges,
deployments, privileged changes, and secret access.

### Bind work to an explicit task contract

Every governed change starts from an issue that defines inputs, outputs,
success criteria, scope, constraints, non-goals, validation, rollout, and stop
conditions. Chat history and branch names are context, not authority.

### Route autonomy by risk

The system classifies work as `low`, `medium`, `high`, or `critical`.
Deterministic policy sets a risk floor based on affected capabilities and
paths. Narrative confidence may raise risk but cannot lower the required
controls.

### Enforce least privilege at multiple layers

Role definitions, tool policy, path scope, workflow permissions, protected
environments, GitHub Apps, and repository rules each constrain a different
part of the lifecycle. No single hook or prompt is treated as complete
mediation.

### Make evidence fail closed

Required evidence must be present, successful, current, and bound to the same
repository, pull request, commit, workflow, and run. Missing, skipped, stale,
duplicate, or mismatched evidence is a failure.

### Support stateless, multi-instance systems

The reference workload must prove behavior across process boundaries. Shared
durability and concurrency belong in PostgreSQL, not process memory.

### Bound recovery

The system classifies failures before retrying, limits automated repair, and
escalates policy, security, repeated, or unknown failures. Retrying is not
itself recovery.

### Demonstrate Continuous AI safely

Agentic workflows may perform bounded, read-only analysis and prepare staged
safe outputs. They augment deterministic CI and never become acceptance
authority.

### Remain evolvable

The framework specification lives outside its own active enforcement plane.
Normative changes are proved in the Northstar reference before they are
documented as supported behavior.

## Non-goals

### Fully autonomous software delivery

The system does not authorize agents to merge, deploy to production, change
governance, or access production secrets without accountable human and
platform authorization.

### Prompt-only safety

Instructions and prompts communicate intent but are not security boundaries.
The system also uses deterministic tool policy, CI, repository rules, protected
environments, and independent review.

### A universal agent runtime

The architecture is portable, but the reference implementation uses GitHub,
GitHub Copilot, GitHub Actions, GitHub Agentic Workflows, and PostgreSQL. Other
hosts must provide equivalent lifecycle, evidence, and acceptance guarantees.

### A replacement for application architecture

The system governs software delivery. It does not choose business domains,
data models, APIs, or deployment topology except where those choices affect
risk and evidence.

### Repository files as proof of hosted controls

Committed policy can express desired rules, but it cannot prove that rulesets,
required reviewers, secret scanning, push protection, environments, or GitHub
App permissions are enabled. Those claims require live hosted evidence.

### Hidden or unlimited repair

The system does not silently weaken checks, retry indefinitely, or reinterpret
failed evidence as success.

### Self-governing framework development

This specification repository does not run the system against itself. Doing so
would couple the ability to change the framework to the correctness of the
framework version being changed.
