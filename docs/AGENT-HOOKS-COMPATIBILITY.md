# Responsible AI Agent Hooks compatibility

This comparison is the isolated gap-filling experiment registered as
[EXT-016](TECHNICAL-EXTENSIONS.md#ext-016---responsible-ai-agent-hooks-comparison).
It does not modify or replace the non-negotiable architecture in
[`Developing-in-Agentic-AI-Systems-Learning-Paths.md`](Developing-in-Agentic-AI-Systems-Learning-Paths.md).

## Conclusion

[Responsible AI Agent Hooks](https://responsibleai.github.io/agent-hooks/) is
architecturally compatible with this AI engineering system, but it is not a
drop-in replacement for the native GitHub Copilot implementation.

Agent Hooks defines a framework-neutral contract between a cooperating agent
host and registered interceptors. It standardizes context, verdicts,
composition, and host obligations at eight lifecycle points:

1. `agent_startup`
2. `input`
3. `pre_model_call`
4. `post_model_call`
5. `pre_tool_call`
6. `post_tool_call`
7. `output`
8. `agent_shutdown`

That model aligns with the system's pre-action, post-action, identity,
composition, audit, and approval concepts.

## Where it fits

Agent Hooks is useful when an organization owns or can adapt the agent host and
wants one interceptor contract across TypeScript, Python, .NET, Go, Rust, or
multiple agent frameworks.

It can express:

- deterministic tool authorization before invocation;
- result control after tool invocation;
- input, model-request, model-response, and final-output policy;
- composed interceptor verdicts;
- context identity and interception records;
- explicit approval seams;
- fail-closed host obligations.

Those capabilities can implement the capability boundary inside an AI
engineering system. They do not replace task contracts, plan approval,
commit-level scope checks, CI, evidence fan-in, repository rules, protected
environments, or human acceptance.

## Compatibility gap with GitHub Copilot

The Northstar reference uses the lifecycle points exposed by GitHub Copilot.
Copilot does not currently expose all eight Agent Hooks points as a conformant
host adapter. In particular, the reference cannot fully and natively mediate
every model request, model response, and final output through the Agent Hooks
contract.

A Copilot bridge can map native `PreToolUse` to `pre_tool_call` and can map
post-tool/session events for audit, but that remains a partial adapter. It must
not claim Agent Hooks conformance.

## Security and trust model

Agent Hooks explicitly describes a cooperative contract, not a security
boundary:

- the host is trusted to emit every required point and honor every verdict;
- registered interceptors receive raw target payloads and are fully trusted;
- conformance does not prove sandboxing, complete mediation, or security;
- host paths that skip the adapter remain outside the contract.

The AI engineering system therefore still requires independent GitHub Actions,
commit-bound evidence, rulesets, protected environments, scoped credentials,
and human review.

The payload model also creates a design choice. Northstar's native hook audit
is deliberately payload-free to avoid recording prompts, commands, request
payloads, idempotency keys, or secrets. An Agent Hooks interceptor receives the
raw target, so deployments must prevent that data from leaking into records.

## Reference experiment

Northstar branch
[`reference/ai-engineering-system-agent-hooks`](https://github.com/webmaxru/northstar-orders-api-demo/tree/reference/ai-engineering-system-agent-hooks)
pins `@responsibleai/agent-hooks@0.1.0-alpha.5` and demonstrates a deliberately
nonconformant partial Copilot bridge.

The experiment includes:

- native `PreToolUse` to Agent Hooks `pre_tool_call` translation;
- deterministic interceptor composition;
- custom identity binding;
- payload-free records;
- role-aware VS Code hook configuration;
- compatibility tests and explicit lifecycle-gap documentation.

## Complexity assessment

For Northstar today, Agent Hooks makes the system more complex:

- a translation layer is required;
- lifecycle coverage remains partial;
- another alpha dependency and native core are introduced;
- identity, audit, and payload handling need additional adaptation;
- the existing native hook already covers the critical pre-tool boundary.

For an organization-owned multi-framework runtime, Agent Hooks can simplify the
system by replacing framework-specific lifecycle integrations with one
contract and one conformance model.

The native Northstar implementation remains canonical. The experimental branch
is preserved for comparison and should not be merged until GitHub Copilot has a
conformant host adapter or the project adopts an owned agent runtime.
