---
name: pi-workflow-orchestration
description: Orchestrates multi-agent work with Pi extensible workflows. Use when a task needs parallel investigation, model-routed agents, specialist review, independent validation, persistent worktrees, checkpoints, or deterministic multi-stage execution.
---

# Pi Workflow Orchestration

Use Pi workflows as explicit topology, not as a catalog of personas. The task contract defines what an agent does; call-level `model`, `thinking`, and `tools` define execution policy. Skills and supplied references carry durable specialist doctrine.

This skill is Pi-only. Other harnesses use their own dispatch adapters and must not imitate Pi's dynamic workflow syntax.

## 1. Decide Whether To Orchestrate

Consider delegation when a bounded branch could return a compact handoff and materially save context, parallelize work, isolate execution, or provide independent judgment. Launch a workflow when that expected benefit clearly exceeds coordination and handoff cost; otherwise keep cohesive work in the parent turn.

Positive signals include:

- a search, repository survey, or source-reading pass would consume substantial parent context;
- a long implementation or investigation is bounded but only loosely related to the parent's core reasoning;
- independent work can run in parallel;
- a fresh context reduces anchoring or preserves independent judgment;
- different stages need different model capability or tool boundaries;
- authorship must be separated from specialist review or independent validation;
- work must be journaled, resumed, checkpointed, or isolated in named worktrees;
- the user explicitly requests a workflow.

No single signal automatically requires delegation. A workflow agent is Pi's fresh-context delegation unit and does not require an installed role. Prefer workflows when results need explicit fan-out/fan-in, persistence, recovery, worktrees, or model routing; prefer the parent when the work is tightly coupled to its current reasoning or the handoff would duplicate most of the context.

Do not create a workflow merely to rename one agent or offload a trivial operation whose result is as large as its input. Completion criterion: every launched agent has a material context, execution, independence, or downstream-consumer benefit that outweighs coordination cost.

## 2. Define Ownership Before Agents

Write the topology in terms of outputs and consumers:

- **Owner:** authors or implements the candidate and reconciles advisory findings.
- **Researcher:** gathers bounded evidence with provenance; does not make the final consequential judgment.
- **Reviewer:** challenges one material concern; does not rewrite or finalize the candidate it reviewed.
- **Validator:** independently checks accepted criteria through the public seam; does not repair the candidate.
- **Synthesizer:** combines independent evidence when no existing owner is responsible for reconciliation.

Ordinary ownership is task-defined in the prompt, not installed as a role. Keep the same owner before and after review. Completion criterion: every review finding returns to an identified owner, and no reviewer becomes the artifact author by being placed last in a chain.

## 3. Select Execution Policy Separately

Use configured model aliases from [model-selection.md](references/model-selection.md). Prefer aliases over concrete provider names so routing can change without rewriting workflows.

For every unroled agent, select an explicit semantic model alias so the parent model cannot leak into workflow routing; then set only the remaining execution policy that differs:

```js
agent("<bounded task contract>", {
  label: "<observable responsibility>",
  model: "workhorse",
  tools: ["read", "write", "edit", "bash"],
})
```

Do not use installed workflow roles for ordinary work. When specialist doctrine matters, tell the agent to load the named skill or provide the exact review mandate, while still selecting model and tools at the call site.

Use `workhorse` for basic review and repair loops, `involved` for intermediate higher-order checkpoints, and `exceptional` for final higher-order checkpoints only when that judgment is admitted and consequential. The alias selects capability only; the task contract and loaded skills define behavior. Completion criterion: every agent has an explicit model alias, and model capability, tools, and behavioral instructions are independently justified.

## 4. Compose Deterministic Topology

- Use a named inline workflow for chat-authored orchestration.
- Use `parallel(name, tasks)` only for independent branches.
- Await results before passing them through `prompt(...)`.
- Use sequential calls when later work consumes earlier work.
- Use `pipeline(...)` only when every item follows the same stages.
- Use `outputSchema` only when another stage consumes structured fields.
- Use `shell()` for deterministic verification gates, not mutation-heavy implementation.
- Use `withWorktree(name, callback)` for persistent isolated implementation ownership.
- Use checkpoints only for decisions requiring human authority.
- Add retries only to repeatable agent work; external effects are not exactly-once.

Consult [workflow-patterns.md](references/workflow-patterns.md) for canonical engineering, research, and review shapes.

Completion criterion: structural keys are stable, result flow is explicit, side effects have one owner, and replay cannot silently repeat a consequential mutation.

## 5. Format Task Contracts

Every agent prompt should contain only the context needed for its responsibility. Pass references and exact constraints rather than the whole parent transcript; require a compact result shaped for its consumer:

```markdown
## Objective
One observable outcome.

## Inputs
Exact files, decisions, evidence, or predecessor output.

## Constraints
Authority boundary, exclusions, public interfaces, and tool limits.

## Deliverable
Concrete artifact or findings format consumed by the next stage.

## Proof
Commands or evidence required before claiming completion.

## Stop conditions
Contradictions or decisions that must return to the owner or human.
```

For implementation, bind one bounded contract and one worktree. For review, name the review surface, accepted behavior, threat or quality lens, and finding format. For validation, name the public seam and pass/fail criteria.

Completion criterion: a fresh agent can execute without inventing scope, behavior, authority, or acceptance criteria.

## 6. Allocate Review Proportionally

Start with the smallest review that can find consequential defects. Add specialist passes only for a material seam:

- architecture for responsibility, coupling, compatibility, or migration risk;
- security for trust boundaries, disclosure, unsafe input/effects, or permission changes;
- performance for measured or structurally credible latency, scale, memory, or concurrency risk;
- focused validation for independent behavioral proof.

Parallelize specialist reviews only when their mandates are independent. Require findings to distinguish conformance defects, evidence gaps, proposals, and out-of-scope observations. The owner reconciles them; consensus does not grant authority.

Completion criterion: each review has a stated trigger and consumer, and no generic checklist is run without a material reason.

## 7. Verify And Report

Before returning:

- inspect every agent result actually consumed;
- run deterministic gates and read their outputs;
- preserve disagreement instead of averaging it away;
- report workflow run ID and worktree paths when relevant;
- distinguish authored output, advisory findings, validation verdict, and unresolved human decisions.

Completion criterion: every success claim is backed by observed output and every unresolved consequential choice is visible.
