# Contributing

The AI engineering system is specified here and proved in
[`webmaxru/northstar-orders-api-demo`](https://github.com/webmaxru/northstar-orders-api-demo).
The two repositories have different responsibilities:

- this repository owns concepts, terminology, architecture, and adoption
  guidance;
- Northstar owns executable controls, application integration, and evidence.

## System changes

For a behavioral or normative change:

1. describe the intended change and affected terminology;
2. implement it in a Northstar branch;
3. add or update focused tests;
4. run `npm run validate:all`;
5. capture the exact Northstar commit and validation outcome;
6. update this repository;
7. include the Northstar evidence in the pull request or commit description.

If PostgreSQL or cross-instance behavior is affected, keep the acceptance
database running for `npm run test:acceptance`. If hosted controls are affected,
report hosted results separately from local results.

## Documentation-only changes

Spelling, formatting, and link repairs may be completed here without a
Northstar code change. A documentation change that modifies a requirement,
control, lifecycle state, or claimed behavior is a system change and must use
the full process above.

## Repository boundary

Do not install this repository's own agent hooks or governance workflows here.
That circular dependency would make it harder to safely evolve the system. The
Northstar reference is the controlled proving ground.
