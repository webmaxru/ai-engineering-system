# Contributing

The AI engineering system is specified here and proved in
[`webmaxru/northstar-orders-api-demo`](https://github.com/webmaxru/northstar-orders-api-demo).
The two repositories have different responsibilities:

- this repository owns concepts, terminology, architecture, and adoption
  guidance;
- Northstar owns executable controls, application integration, and evidence.

## Architectural authority

[`docs/Developing-in-Agentic-AI-Systems-Learning-Paths.md`](docs/Developing-in-Agentic-AI-Systems-Learning-Paths.md)
is non-negotiable. Before changing system behavior:

1. cite the guide heading and line range that authorizes the decision;
2. classify the change as a required guide implementation, a guide-offered
   choice, or a gap-filling extension;
3. reject or redesign any proposal that conflicts with the guide;
4. update `docs/GUIDE-CONFORMANCE.md`;
5. update `docs/TECHNICAL-EXTENSIONS.md` when the guide does not explicitly
   prescribe the implementation;
6. prove the behavior in Northstar before documenting it as supported.

No issue, pull request, ADR, implementation, or convenience convention can
override the guide.

Framework lock and ledger maintenance may be classified as non-normative
bookkeeping only when it changes no runtime, adoption, terminology, or evidence
semantics. It must still point to an exact accepted Northstar revision and pass
the framework verifier.

## System changes

For a behavioral or normative change:

1. describe the intended change, affected terminology, and guide basis;
2. identify every affected technical-extension entry;
3. implement it in a Northstar branch;
4. add or update focused tests;
5. run `npm run validate:all`;
6. capture the exact Northstar commit and validation outcome;
7. update this repository;
8. set conformance to `conformant` only when no required reference change
   remains pending;
9. include the guide citations, extension classification, and Northstar
   evidence in the pull request or commit description.

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
