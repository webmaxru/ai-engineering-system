# Second demonstration: retrieve an order

**Not implemented at the audited revision; a draft implementation candidate
now exists but is not accepted or ready for a live demonstration.** Northstar
`b65c2de5c8224342c72c37eeed7ef9f965ad8a2c` exposes `GET /health` and
`POST /orders`, not `GET /orders/:id`. All names and data here are fictional.
The authoritative lifecycle remains
[Developing-in-Agentic-AI-Systems-Learning-Paths.md](Developing-in-Agentic-AI-Systems-Learning-Paths.md):
**plan → act → evaluate; agents propose; humans and policy accept**.

This adds visible product behavior instead of pretending WI-1842 is missing.
Use a separate issue/task from the control-plane repair. Do not begin cloud
implementation until the [surface/evidence blockers](AUDIT-2026-09-23.md) are
repaired and accepted.

## Current candidate status (2026-09-28)

Issue [#17](https://github.com/webmaxru/northstar-orders-api-demo/issues/17)
has a draft implementation in PR
[#19](https://github.com/webmaxru/northstar-orders-api-demo/pull/19), head
`cf7622166e48cdc543121adaa37a0ab57dcb4c45`. The issue contract digest is
`f1749b847376ddf8c50f934775dee6881e322ba2ca820eefe3942c6e4b222674`; its
machine plan digest is
`11bfe6ae20df762202c9e0554fc62b257371f139ca380dec2a2ac8aeea5ffcaf`. Both bind the implementation to
`agent/implement/aes-surface-evidence` at
`17e7a5c5f1fbf88a92351043c675f555f4c7f04f`. PR #19 remains draft.

On the rebased source tree, `npm run validate` passed 470 unit tests and 79
offline governance checks; `npm run test:acceptance` passed 12/12 with
independent-process retrieval and restart; scope (13 paths, zero violations)
and merge checks passed against the declared base. `npm run validate:all`
exited 1 at Zizmor with 86 findings (65 errors, 21 notes); Poutine reported
zero findings, and no suppressions were added. Hosted Plan Gate, scope,
acceptance, quality, dependency review, secret scan, and evidence pass on the
refreshed head; the latest CodeQL rerun is pending. `repository-controls` and
`human-review` still fail; an independent review has been requested but not
submitted. No current VS Code or Copilot cloud run has been completed. Do not
present this draft as an accepted or cross-surface demo.

## Issue #17 task contract summary

The live task
[contract](https://github.com/webmaxru/northstar-orders-api-demo/issues/17)
is authoritative. This table summarizes its scope; it is not a replacement
for the issue body or its current digest.

| Field | Issue #17 contract |
| --- | --- |
| Task ID | `WI-1843` (live issue #17; draft candidate only) |
| Goal | Retrieve an existing fictional order by UUID, including from another stateless API process |
| Inputs | Existing Order shape, order services/repositories, ADR 007, current governance policy and issue-named sources |
| Output | `GET /orders/:id`, focused tests, PostgreSQL/process acceptance, evidence and paired demo runbooks |
| Allowed scope | `src/app.ts`, `src/domain/order.ts`, `src/services/order-service.ts`, `src/services/postgres-idempotent-order-service.ts`, `src/repositories/in-memory-order-repository.ts`, `tests/unit/**`, `tests/acceptance/**`, `tests/helpers/**`, `tests/fixtures/idempotency-http-server.ts`, `docs/demos/**`, `docs/architecture.md`, `README.md` |
| Prohibited scope | `.github/**`, `scripts/**`, package/lock changes, migrations, production resources, authentication redesign, changing `POST /orders` semantics |
| Non-goals | List/search, updates/deletes, pagination, new persistence, real customer data, production authentication |
| Risk | Medium-risk bounded application/documentation work; deterministic policy floors still apply |
| Rollback | Revert route/read interfaces/implementations/tests together; preserve orders and POST behavior |
| Stop | Scope expansion, base/authority mismatch, missing durable proof, policy/security failure, or a new schema/authentication requirement |

The live issue was created from Northstar's task template and defines the
contract digest. This document and fixtures are not task authority.
In-memory mode remains explicitly non-durable. The unauthenticated fictional
demo is not a production-ready order-access design.

## Observable success criteria

| ID | Issue #17 success criterion | Stable proving test |
| --- | --- | --- |
| AC1 | Existing valid UUID returns 200 and unchanged `Order` shape | `retrieves an existing order by id` |
| AC2 | Malformed UUID returns 400 with stable validation error | `rejects a malformed order id` |
| AC3 | Valid absent UUID returns 404, not 500 or empty success | `returns not found for an unknown order id` |
| AC4 | Retrieval never creates an order or changes idempotency records | `retrieving an order has no write side effects` |
| AC5 | An order created through one API process is retrievable through another via PostgreSQL | `retrieves an order across independent server processes` |
| AC6 | Retrieval succeeds after the writer process restarts | `retrieves a durable order after process restart` |
| AC7 | Unexpected read failures use the existing generic error boundary | `hides unexpected order lookup failures` |
| AC8 | Both runbooks distinguish high-risk plan-first from medium single-PR plan + execution and expose unverified controls | Runbook review against issue #17 |

The candidate must follow the existing `OrderValidationError` and error-handler
conventions. The draft PR and its tests—not this summary—are authoritative for
the exact response envelope.

## Candidate implementation outline

1. Add a small shared read operation returning `Order` or explicit absence
   through existing service/repository abstractions. Implement in-memory and
   PostgreSQL paths; reuse parameterized queries and mapping patterns.
2. Validate UUID input and add the route in `buildApp`. Distinguish malformed,
   absent and unexpected failure; preserve the POST handler.
3. Add focused domain/service/route tests and a real two-process HTTP acceptance
   harness with isolated database setup and explicit teardown.
4. Run focused tests, `npm run validate:all`, existing WI-1842 acceptance and
   new process tests. Retain scanner diagnostics as well as exit codes.
5. Map criteria to actual artifacts at the immutable head. Obtain current
   independent review/hosted checks and the trusted publisher's decision.

No migration should be needed because `orders` already has an identifier.
If inspection disproves this assumption, stop and revise the live scope/plan
rather than expanding authority.

## Technical-session runbook

| Scene | Presenter action | Evidence |
| --- | --- | --- |
| Request | Show live issue, scope, non-goals and criteria | Contract, not a free-form prompt alone |
| Plan | Read-only planning in selected host | Task digest, base SHA, risks and bounded files |
| Approval | Follow the actually implemented risk policy | Independent approval if required; no invented shortcut |
| Act | Scoped implementation after host canaries pass | Small diff and proving tests |
| Evaluate | Create, retrieve through second process, try malformed/unknown IDs, restart and reread | 201, 200, 400/404 and durable reread |
| Accept | Show current checks/review/rules/trusted decision | `ready_for_acceptance` only if genuinely produced |

Allow 12-15 presentation minutes plus asynchronous cloud/CI time. Pre-record
the accepted run with its session URL, head and evidence visible. Do not hide a
failed live run behind an unlabelled recording or old report. While prerequisites remain blocked, present the contract/design and label the
implementation **a draft candidate with local evidence, not an accepted demo**.
