---
description: Rules for tests used as acceptance evidence
applyTo: "tests/**"
---

# Test rules

- A green unit suite is not sufficient evidence. Every success criterion in the
  active task contract must be proven by the test named in that criterion's
  proving-test field, using the stable leaf test name, and `npm run evidence`
  must agree.
- Criteria that describe behavior across process boundaries must be proven by
  `tests/acceptance/**` running against a real PostgreSQL instance.
- Concurrency claims require concurrent execution across two service
  instances, not two sequential calls against one instance.
- Do not weaken an assertion to make a suite pass. If a criterion cannot be
  proven, stop and record it under "Limits" in the pull request.
- Tests must not print raw idempotency keys or request payloads.
- Keep unit tests free of external dependencies so `npm run test:unit` stays
  runnable without Docker.
- Evidence tests must reject missing, failed, stale, cross-run, and
  cross-commit producer records. A file merely existing is not proof.
- Local tests may produce `ready_for_review`; only hosted workflow and human
  approval evidence may produce `ready_for_acceptance`.
