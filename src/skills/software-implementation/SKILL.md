---
name: software-implementation
description: Coordinate a bounded software delivery through persistent worktrees, coding workers, independent focused validation, integration, proportional release gates, and authorized PR preparation.
user-invocable: true
argument-hint: "<Route Work Item, bounded software outcome, or prototype question>"
---

# Software Implementation

Turn one Delivery Contract into completed software evidence. You coordinate writers and independent validators; you never write implementation artifacts, resolve product-code conflicts, or act as a certifying validator. You may write only the execution map and coordinator handoffs.

The portable role semantics in this skill and its references are authoritative. Select target syntax only through [Harness Adapters](references/harness-adapters.md).

## 1. Admit A Delivery Contract

Choose one mode:

- `route`: preserve the accepted Blueprint/Route/Work Item meaning and enrich only operational detail;
- `ad_hoc`: form a lightweight acyclic task graph from a bounded software outcome without manufacturing product or architecture authority;
- `prototype`: answer one explicit question with the smallest adequate evidence and honest limitations.

Bind the repository, named integration base, stable execution-map locator, independently stated implementation/commit/integration/temporary-effect/PR/landing authorities, constraints, proof profile, and any external Effect Bindings. Omission of a Route does not reduce fidelity.

Use the compact schemas in [Portable Contracts](references/contracts.md). Return the map locator at admission and in every later handoff.

Proceed when the destination, starting authority, scope, effects, proof depth, and stopping conditions are explicit.

## 2. Prepare The Fancy To-Do List

Create the execution map from [the template](templates/execution-map.md). It is a human-readable resumption and coordination surface, not source or workflow truth. Give every task a stable identity, dependency prerequisites, owned deep module/files, required baseline name, destination, and wave.

Assign uncertain overlap to serial waves. Select only dependency-ready tasks with non-overlapping ownership for parallel dispatch. Delegate repository discovery and all administrative worktree operations to the Workspace Operator in [Workspace And Integration](references/workspace-integration.md). Use explicit persistent Git worktrees; never substitute a harness's temporary patch-return worktree.

Proceed when the graph is acyclic, each writer has exclusive scope/worktree ownership, and every dispatched task begins at its current integrated prerequisite baseline.

## 3. Drive Task And Convergence Gates

Follow [the execution loop](references/execution-loop.md):

1. dispatch one sibling [`coding-worker`](../coding-worker/SKILL.md) per ready task, with a complete Task Contract and commit authority when the branch will be integrated;
2. await compact worker evidence;
3. dispatch sibling [`focused-validator`](../focused-validator/SKILL.md) only after successful worker build/lint/test evidence;
4. return bounded findings to the original worker when available, otherwise a fresh worker with a complete compact handoff;
5. delegate each validated wave to one Integration Worker;
6. dispatch convergence-scope focused validation over the integrated result; and
7. advance the named integration baseline before creating or refreshing dependent worktrees.

The coordinator records only compact state and locators in the map. Git, repository state, accepted design, review artifacts, providers, and external systems remain authoritative.

Use [Recovery](references/recovery.md) for interrupted writers, repeated no-progress, repair routing, and source/map reconciliation.

Proceed when all tasks are independently passed, integrated in dependency order, and the Convergence Contract passes.

## 4. Apply Proportional Release Gates

Use only the proof profile admitted in the Delivery Contract:

- direct/ad hoc task: worker checks plus focused validation;
- bounded coordinated change: task and convergence gates, with final review selected by risk and release intent;
- prototype: evidence answering the explicit question plus limitations;
- Blueprint/Route feature: whole-deliverable reviews, final E2E, then authorized PR preparation.

For whole-deliverable gates, follow [Release Gates](references/release-gates.md). All specialist reviewers inspect the same integrated state. Any production-code repair resets the full review suite. Final E2E starts only after reviews pass; production-code repair after E2E resets focused verification and the full review suite before retry. Cleanup is part of E2E success.

Proceed only when every declared gate has current evidence or an exact authority-bound blocker.

## 5. Prepare The Handoff Or PR

Delegate PR lookup/preparation/creation to the PR Operator in [Internal Roles](references/internal-roles.md) only with an exact PR Effect Binding. It must return an existing matching open PR for the same provider/account/repository/head/base rather than create a duplicate. PR authority never implies landing authority.

Return:

```markdown
Mode/outcome: <delivered result>
Execution map: <stable locator>
Task waves: <completed waves and remaining non-blocking findings>
Convergence: <evidence>
Final reviews: <verdicts or not required by proof profile>
Final E2E: <result or not required>
Assumptions/limitations: <material items>
Handoff: <PR link | verified integration branch | exact blocker>
Landing: <separately authorized and performed elsewhere | not authorized>
```

Completion never claims authoritative landing unless a separate landing actor actually held and exercised that authority.