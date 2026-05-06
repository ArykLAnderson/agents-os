---
name: paired-agent-unit
description: Use Paired Agent Units as subagent-like workers. TRIGGER when a task should be delegated to a driver+advisor pair, when the user asks for paired agents/verifier/advisor workflow, or when citation-sensitive research should be run with advisor checking. Explains how to invoke available pair modes and inspect compact artifacts.
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Paired Agent Unit

A Paired Agent Unit is a subagent-like worker made of:

- a **driver** that performs the task normally;
- an **advisor responder** that observes runtime-derived turn events;
- tagged steering messages when the advisor finds an issue;
- compact result plus full local artifacts.

Use this skill to decide when and how to invoke paired units. Do not simulate the pattern with ordinary prompting when a live pair mode exists, and do not use pi-subagents as a substitute for the `run_paired_agent` tool.

## Critical invocation warning

Use the `run_paired_agent` tool as the canonical agent-facing interface. It creates an isolated driver session plus an isolated advisor session, waits for both to finish, and returns a compact handoff with artifact refs.

Do **not** wrap `/pi-pair ...` inside the `subagent`/`pi-subagents` tool. That creates an ordinary delegated agent whose prompt text starts with `/pi-pair`; the child may treat it as text and do unaudited research instead of running the paired-unit runtime.

`/pi-pair` is a secondary human-facing wrapper, not the primary agent interface and not a normal subagent agent name or prompt template. Do not silently fall back to ordinary research while claiming a paired unit was used.

## Available live modes

Currently live for agents:

```text
run_paired_agent({ mode: "research", task: "<task>" })
run_paired_agent({ mode: "implementation", task: "<task>" })
```

Secondary human-facing wrappers:

```text
/pi-pair research "<task>"
/pi-pair implementation "<task>"
```

Defined but not live yet:

- `tdd`

Do not invoke non-live modes unless the runtime later documents support for them.

## When to use a paired unit

Use an available paired unit when the work benefits from a built-in advisor loop:

- current factual research;
- citation-sensitive claims;
- pricing, model limits, auth/product-limit distinctions;
- research handoffs where a coordinator wants one compact worker result with artifacts;
- user explicitly asks for paired agents, verifier, advisor, or paired subagent behavior.

Do not use a paired unit for trivial lookups or broad implementation work. Use `implementation` only for bounded implementation tasks where advisor checks for scope, validation, changed-file, and completion-claim issues.

## Discovery and inspection

Use `/pi-pair list` to see live and defined pair modes. Use `/pi-pair inspect latest` or `/pi-pair inspect <run-id>` to retrieve a compact run handoff without shell spelunking.

## Invocation contract

Invoke the pair as the worker, not as a normal prompt template:

```text
run_paired_agent({ mode: "<mode>", task: "<task>" })
```

For research:

```text
run_paired_agent({ mode: "research", task: "Answer with official sources: <question>" })
```

The driver payloads are runtime-derived. Do not ask the driver to create checkpoint payloads for the advisor.

## Coordinator workflow

When acting as a coordinator:

1. Decide whether an available pair mode fits.
2. Invoke `run_paired_agent` with a clear, bounded task.
3. Wait for the pair to finish.
4. Inspect compact result and artifacts.
5. Use the compact result as the subagent handoff; consult full artifacts only when needed.

Artifact inspection:

```sh
RUN=$(ls -td .pi/artifacts/pairs/runs/* | head -1)
cat "$RUN/compact-result.json"
cat "$RUN/report.md"
cat "$RUN/messages.jsonl"
cat "$RUN/transport.json"
```

Evidence of a true paired run:

- `pair.json` records the pair mode and runtime.
- `messages.jsonl` has `advisor.decision` with `source: "agent-session"` when the advisor ran.
- If intervention happened, `messages.jsonl` has `steering.injected` and `driver.advisor_handling`.

## Result expectations

The pair returns/persists:

- `status`: `success`, `partial`, `blocked`, `needs-human`, or `failed`;
- driver result summary;
- `advisor_impact`: 1–2 paragraph synthesized impact narrative;
- open risks;
- artifact references.

Use the compact result for higher-level workflow decisions. Avoid dumping full traces into the parent thread unless debugging.

## Important constraints

- Filesystem is for artifacts only, not live feedback polling.
- Advisor decisions come from runtime-derived driver turn events.
- Advisor is not a general autonomous implementer unless a future pair definition explicitly says so.
- V1 research advisor runs as a separate in-memory Pi agent session, not a visible named TUI session.
