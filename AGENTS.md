# AI Engineering System repository instructions

This repository is the canonical description of the AI engineering system. It
is deliberately outside the system's own enforcement boundary.

## Non-negotiable architectural authority

[`docs/Developing-in-Agentic-AI-Systems-Learning-Paths.md`](docs/Developing-in-Agentic-AI-Systems-Learning-Paths.md)
is the non-negotiable architectural authority for every current and future
feature of the AI engineering system.

- Every architectural decision must trace to the guide's terminology,
  principles, lifecycle, responsibility boundaries, and named technologies.
- No design, implementation, template, or convenience may contradict,
  weaken, replace, or silently reinterpret the guide.
- Additional technical measures are allowed only to fill a gap the guide does
  not address. They must be additive and compatible with every applicable
  guide requirement.
- Every implementation not explicitly described by the guide must be recorded
  in `docs/TECHNICAL-EXTENSIONS.md` with the gap it fills, why it does not
  conflict, its trust and operational consequences, and the evidence that
  proves it. Normative runtime behavior requires Northstar evidence.
  Non-normative framework bookkeeping must be labelled as such and requires
  framework-verifier evidence plus an exact accepted Northstar revision.
- A requested feature that conflicts with the guide must be rejected or
  redesigned. Another repository document cannot override the guide.
- If the guide is ambiguous, stop the architectural decision until the
  ambiguity and the chosen non-conflicting interpretation are documented.

Architectural reviews must cite the relevant guide sections and separately
identify every gap-filling extension. Absence from the extensions register is
not evidence that an implementation is guide-defined.

Before completing a normative change, update
`docs/GUIDE-CONFORMANCE.md` with the affected guide requirements and update
`docs/TECHNICAL-EXTENSIONS.md` for every added or changed gap-filling
mechanism. A change to the guide invalidates the previous conformance
conclusion until both repositories have been audited again.

## Non-self-governance rule

Do not add active agent hooks, custom agents, agentic workflows, enforcement
workflows, or tool-authorization scripts to this repository.

Inert snapshots are permitted only below `templates/`. They must not be
referenced by root repository configuration, and instruction files that could
be discovered by an agent must use non-active names such as
`AGENTS.snapshot.md`.

Human maintainers retain ordinary Git and GitHub authority here. Review remains
required by team practice, not by a copy of the system under design.

## Required reference implementation

Every normative change to this repository must be implemented and tested in
[`webmaxru/northstar-orders-api-demo`](https://github.com/webmaxru/northstar-orders-api-demo)
before the system change is considered complete.

A normative change includes any change to:

- terminology or lifecycle semantics;
- task, plan, approval, risk, scope, or evidence contracts;
- agent roles or capability boundaries;
- hooks, MCP governance, workflows, safe outputs, or hosted controls;
- recovery, maintenance, observability, or acceptance requirements;
- quickstart steps that claim executable behavior.

The change record must identify:

1. the exact Northstar commit SHA;
2. the Northstar branch or pull request;
3. the focused tests for the changed behavior;
4. the full validation command and result;
5. the PostgreSQL acceptance result when process-boundary behavior is
   relevant;
6. hosted evidence or an explicit statement that hosted controls remain
   unverified.

Edits to this repository alone are never sufficient evidence that the system
works.

## Change order

1. Read the learning guide and the affected system documents.
2. State the proposed semantic or architectural change.
3. Implement it in Northstar under Northstar's active task contract and
   governance controls.
4. Run the focused and complete reference validation.
5. Update this repository to describe only the behavior proved by Northstar.
6. When control-plane files changed, refresh `templates/northstar/` and its
   `reference-lock.json` from the validated Northstar commit.
7. Set architecture conformance to `conformant` only after every required
   Northstar change is accepted and no blocker remains.
8. Run `pwsh -File tools/verify-architecture.ps1`.
9. Link the exact evidence in the change description.

Pure spelling, formatting, and broken-link fixes do not require a Northstar
code change, but they must not alter normative meaning.

## Documentation rules

- Use the canonical terms in `docs/TERMINOLOGY.md`.
- Keep **plan → act → evaluate** and
  **agents propose; humans and policy accept** as the central model.
- Describe GitHub as the **system of record and control plane**, use the
  **contributor model** for review, and route autonomy through
  **risk-based autonomy**.
- Use the guide's **MCP allow list** terminology when describing server
  governance.
- Keep `architecture-lock.json` synchronized with the audited guide and
  Northstar commit.
- Do not publish or recommend an adoption snapshot while
  `architecture-lock.json` reports blocked conformance.
- Distinguish local `ready_for_review` from hosted
  `ready_for_acceptance`.
- Never describe a repository file as proof that an external GitHub setting is
  enabled.
- Expose limitations and unverified controls instead of filling gaps with
  success-shaped language.
- Keep the Northstar application fictional and do not present its incidents,
  identifiers, or metrics as real.
