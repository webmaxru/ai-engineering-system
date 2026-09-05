# Recovery policy

Retrying is not recovery. Recovery identifies which layer failed, changes that
layer, and evaluates again against the same task contract.

`scripts/repair-budget.mjs` implements the policy and
`tests/unit/repair-budget.test.ts` proves it.

## Failure signature

An attempt is `{ "check": "...", "message": "..." }`. Before comparison, the
message is normalized so run IDs, SHAs, durations, numbers, paths, and addresses
do not make the same failure look new.

## Failure classification

| Signal | Classification | Response |
| --- | --- | --- |
| Misunderstood requirement, wrong logic, failed assertion | reasoning error | Revise the plan or implementation; never weaken the assertion |
| Bad command, workflow, permission, or execution setup | tool misuse | Correct the tool or configuration |
| Stale PR, missing decision, missing source, inconsistent memory | context issue | Refresh the issue, PR, base, and authoritative sources |
| Merge conflict, semantic conflict, duplicate or incompatible work | conflict | Reconcile against the PR state anchor |
| Permission, policy, 401, 403 | policy failure | Escalate immediately; authority is not a prompting problem |
| CodeQL, secret, credential, vulnerability, injection | security failure | Investigate and escalate; never retry the signal away |
| Connection timeout or missing service | transient environment failure | Repair the environment, then retry once |
| Anything unclassified | unknown | Escalate before spending another attempt |

## Budget and stop conditions

Automated repair stops when any condition is true:

- the same required check fails twice with the same normalized signature;
- a policy or security failure occurs;
- the failure cannot be classified;
- three attempts have been spent.

The escalation report must state what failed, what was attempted, the evidence
that exists, and the available options or recommended next step.

## Rollback

- Keep unsafe work isolated on a branch.
- Prefer small commits and pull requests that are easy to revert.
- Close or discard an unmerged pull request when risk increases.
- Revert merged commits through the normal reviewed workflow.
- Database or production rollback requires an explicit owner and recovery
  validation; never improvise destructive schema commands.

## Try it

```powershell
node scripts/repair-budget.mjs tests/fixtures/attempts.sample.json
```

The sample contains two failures that differ only in path, duration, and run
ID. They normalize to one signature and the system escalates instead of
spending a third attempt.
