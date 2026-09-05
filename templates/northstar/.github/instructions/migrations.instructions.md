---
description: Rules for database migrations
applyTo: "migrations/**"
---

# Migration rules

- Migrations are additive. Do not drop or rename an existing column or table.
- Schema change is outside the agent capability boundary defined in
  `AGENTS.md`. Propose the migration, then stop for human approval.
- Store hashes, never raw idempotency keys or request payloads.
- Every idempotency record needs an `expires_at` so the 24 hour retention
  window in ADR-007 can be enforced by deletion.
- Index what the transaction path reads. The advisory-lock plus lookup pattern
  reads by `key_hash`.
