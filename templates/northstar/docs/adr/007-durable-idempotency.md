# ADR-007: Durable idempotency for order creation

- Status: accepted for WI-1842
- Scope: `POST /orders`

## Decision

Use PostgreSQL to coordinate idempotency across service instances.

1. Hash the idempotency key before persistence.
2. Canonically serialize and hash the validated request.
3. Acquire a transaction-scoped advisory lock for the key hash.
4. Reuse a completed response when key and request hash match.
5. Return `409` when the same key is reused with a different request hash.
6. Create the order and completed idempotency record in one transaction.
7. Retain records for 24 hours.
8. Emit replay and conflict metrics without key or payload values.

## Rejected option: process-local map

A map can pass a single-process happy-path test but fails after restart, across instances, and under check-then-act races.

## Failure and recovery

- Do not loop indefinitely on database failures.
- Roll back the transaction and return a controlled server error.
- Escalate schema, dependency, public API, workflow, or permission changes.
- Rollback is removal of the feature wiring plus the additive tables after retention and operational review.

