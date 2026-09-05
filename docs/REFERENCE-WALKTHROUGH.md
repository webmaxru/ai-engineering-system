# Reference implementation walkthrough

## Run the reference implementation

Prerequisites:

- Node.js 22 or later;
- Docker Desktop;
- Git;
- GitHub CLI for live issue and pull-request operations.

```powershell
git clone https://github.com/webmaxru/northstar-orders-api-demo.git
Set-Location northstar-orders-api-demo
npm ci
npm run db:up
npm run demo:system
```

The demo:

1. parses a non-authoritative offline task fixture;
2. materializes a machine-readable plan;
3. applies deterministic risk and scope policy;
4. proves a dangerous tool request is denied before execution;
5. runs instruction, governance, quality, build, and unit checks;
6. runs PostgreSQL acceptance tests across two service instances;
7. runs dependency and supplemental secret gates;
8. validates merge compatibility;
9. builds a commit-bound execution report.

Expected local decision:

```text
ready_for_review
```

Local execution cannot manufacture GitHub reviews, CodeQL workflow provenance,
rulesets, or protected-environment approvals, so it must not claim
`ready_for_acceptance`.

Stop the database when finished:

```powershell
npm run db:down
```

## Observe the application invariant

Start the API with PostgreSQL:

```powershell
$env:DATABASE_URL = "postgres://northstar:northstar@127.0.0.1:55432/northstar"
$env:PORT = "3000"
npm start
```

In another terminal:

```powershell
$body = '{"sku":"WIDGET-1","quantity":2}'
curl.exe -i -X POST http://localhost:3000/orders `
  -H "content-type: application/json" `
  -H "idempotency-key: demo-order-001" `
  -d $body
curl.exe -i -X POST http://localhost:3000/orders `
  -H "content-type: application/json" `
  -H "idempotency-key: demo-order-001" `
  -d $body
```

The first response is `201` with `x-idempotent-replay: false`. The second is
`200` with `x-idempotent-replay: true` and the same order ID. The acceptance
suite proves the same behavior across two service instances sharing
PostgreSQL.

## Exercise plan -> act -> evaluate

For a live task in Northstar:

1. Create an issue from `.github/ISSUE_TEMPLATE/agent-task.yml`.
2. Run `/plan <issue>` with the read-only planner.
3. Inspect the local plan proposal and machine-readable plan.
4. Have a human explicitly publish and review the plan-only pull request.
5. Record the approval bound to the plan digest and plan-only commit.
6. Create `agent/implement/<task-id>` from the approved base SHA.
7. Start a fresh implementation session with `/implement <issue>`.
8. Let hooks and commit-level policy enforce task and plan scope.
9. Run the governed evaluation.
10. Have humans and platform policy accept, reject, or request changes.

Northstar's README and repository instructions contain the current exact
commands.

## Adopt the architecture in another repository

Implement the system in layers rather than copying files without context.

### 1. Establish authority

- Define an issue task contract.
- Make the pull request the state anchor.
- Define immutable base and head identities.
- Define what evidence is required for each success criterion.

### 2. Separate roles

- Create a read-only planner.
- Give implementation only task-scoped write tools.
- Keep security and risk review read-only.
- Require explicit handoffs between phases.

### 3. Add machine-readable policy

- Validate the task and plan schemas.
- Derive a deterministic risk floor.
- Bind approval to exact digests and commits.
- Enforce both issue scope and narrower plan scope.

### 4. Add layered controls

- Pre-action tool authorization.
- Commit-level changed-path validation.
- Least-privilege workflow permissions.
- Dependency, security, quality, build, and acceptance checks.
- Protected environments and rules for privileged operations.

### 5. Add trustworthy evidence

- Emit one envelope per check producer.
- Bind every result to one repository, pull request, SHA, workflow, and run.
- Reject absent, stale, skipped, duplicated, or mismatched evidence.
- Reserve acceptance for an independent trusted publisher.

### 6. Add recovery and operations

- Classify failures before retrying.
- Bound repair attempts.
- Define rollback and escalation.
- Review failed runs, permissions, secrets, rulesets, environments, retention,
  and agent ownership on a cadence.

### 7. Prove the installation

Use an application behavior that crosses a real process or durability boundary.
Unit tests alone are not sufficient when a success criterion concerns multiple
instances, persistence, queues, networks, or deployment policy.

## Hosted setup

Before claiming `ready_for_acceptance`, verify live:

- required pull requests and up-to-date branches;
- required status checks;
- current approvals and CODEOWNERS review;
- force-push, deletion, and bypass restrictions;
- secret scanning and push protection;
- protected production and system-maintenance environments;
- least-privilege GitHub App identities and environment-scoped keys;
- evidence retention;
- approved MCP registry entries and named tools.
