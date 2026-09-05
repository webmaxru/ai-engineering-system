# Inert reference templates

The files under `templates/` are examples and snapshots. GitHub does not load
their nested `.github` directories as repository configuration, so they cannot
govern this repository.

`templates/northstar/` mirrors the control-plane portion of the executable
Northstar reference:

- repository and path-specific instructions;
- task and pull-request templates;
- role-specific agent definitions;
- native Copilot hooks;
- governance policy;
- deterministic and agentic workflows;
- contract, authorization, evidence, governance, and recovery scripts;
- focused unit tests and offline fixtures.

These files intentionally retain Northstar-specific names and assumptions.
They are not a universal copy-and-paste starter. Use
[`docs/QUICKSTART.md`](../docs/QUICKSTART.md) to adopt the architecture layer
by layer, then prove the installation against real application behavior.

The exact source commit for a published snapshot is recorded in
`northstar/reference-lock.json`.

The lock also records whether the snapshot is accepted for adoption. Do not
copy from a snapshot marked `known-defective` or from a framework revision
whose architecture conformance is blocked.

The source `AGENTS.md` is intentionally stored as `AGENTS.snapshot.md`.
`AGENTS.md` files are discovered recursively by agent tooling, so retaining its
active name would apply Northstar's instructions inside this repository.

Verify a checkout against a sibling Northstar clone:

```powershell
pwsh -File tools\verify-reference.ps1
```
