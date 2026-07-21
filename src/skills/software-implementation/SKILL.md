---
name: software-implementation
description: Coordinate a bounded software delivery from a current Feature Atlas handoff or explicit ad hoc/prototype Contract through persistent worktrees, independent validation, integration, authoritative proof gates, and authorized PR preparation.
user-invocable: true
argument-hint: "<current Atlas execution handoff, bounded software outcome, or prototype question>"
---

# Software Implementation

Turn one Delivery Contract into completed software evidence. You coordinate writers and independent validators; you never write implementation artifacts, resolve product-code conflicts, or act as a certifying validator. You may write only the execution map and coordinator handoffs.

The portable role semantics in this skill and its references are authoritative. Select target syntax only through [Harness Adapters](references/harness-adapters.md).

## 1. Admit A Delivery Contract

Choose one mode:

- `atlas`: consume an exact current `HandoffReady` or admissible `HandoffWithLimitations` from Feature Atlas without changing its accepted meaning;
- `ad_hoc`: form a lightweight acyclic task graph from a bounded software outcome without manufacturing product or architecture authority; or
- `prototype`: answer one explicit question with the smallest adequate evidence and honest limitations.

There is no generic `route` admission mode. A legacy Route package, candidate, ticket graph, summary, or hand-written imitation cannot acquire Atlas authority here. Admit accepted feature delivery only from the current immutable Atlas Map Decision through the [Feature Atlas storage/domain seam](../feature-atlas/references/storage-adapters.md); never call `gh`, infer a tracker, or read provider file paths as the semantic interface.

For `atlas`, persist the exact Delivery Binding defined in [Portable Contracts](references/contracts.md): Atlas, Map, current Decision and accepted snapshot integrity; Blueprint revisions; Feature/Leg/Work Item identities and local-label bindings; ownership; direct prerequisites and convergence; transition/compatibility/cleanup; imported proof/E2E/security allocation; invalidators; qualified evidence; typed limitations; publication integrity; and explicit absent/present authorities. Refuse a summary, historical Decision, `HandoffRefusal`, incomplete/conflicted projection, omitted authority, or unverifiable binding. A `HandoffWithLimitations` is admissible only to the exact boundary its typed limitations and separately explicit implementation authority allow; affected work remains blocked.

For every mode, bind the repository, named integration base, stable execution-map locator, independently stated implementation/commit/internal-integration/temporary-local-effect/external-live-effect/PR/merge/deployment/landing authorities, constraints, proof profile, and external Effect Bindings. Omission of Atlas in `ad_hoc`/`prototype` does not reduce fidelity; those modes must not claim Atlas realization.

At Atlas admission, perform the Currentness Check in [Portable Contracts](references/contracts.md). Repeat it on coordinator resume, before selecting every dependency frontier, before every effectful gate, and before returning a result. A successor, triggered invalidator, Decision/projection conflict, or unverifiable binding stops unless the exact admitted typed limitation explicitly defines the bounded consequence; never follow `latest`, infer equivalence, or silently upgrade a limitation.

Proceed when destination, starting authority, scope, effects, proof depth, stopping conditions, and—when applicable—the exact current Atlas binding are explicit.

## 2. Prepare The Fancy To-Do List

Create the execution map from [the template](templates/execution-map.md). It is a human-readable resumption and coordination surface, not source, Atlas, or workflow truth. In Atlas mode, copy the Delivery Binding and accepted execution graph into the map: stable Atlas identities/local labels remain visible on every task and accepted proof barrier. Operational subdivision may add detail but cannot change Work Item ownership, behavior, prerequisites, convergence, or proof order.

Give every task a stable execution identity, Atlas binding when applicable, dependency prerequisites, owned deep module/files, required baseline name, destination, and wave. Give imported proof gates their accepted owners, prerequisites, effect needs, pass claims, and downstream blockers. This supports an effect-bound gate between implementation items—for example FM-003's bounded-live proof after WI-014 and before WI-015—rather than forcing all proof to the end.

Assign uncertain overlap to serial waves. Select only dependency-ready tasks with non-overlapping ownership for parallel dispatch. Delegate repository discovery and all administrative worktree operations to the Workspace Operator in [Workspace And Integration](references/workspace-integration.md). Use explicit persistent Git worktrees; never substitute a harness's temporary patch-return worktree.

Proceed when the graph is acyclic, each writer has exclusive scope/worktree ownership, every dispatched task begins at its current integrated prerequisite baseline, and the Atlas currentness check is clear for that frontier.

## 3. Drive Task And Convergence Gates

Follow [the execution loop](references/execution-loop.md):

1. dispatch one sibling [`coding-worker`](../coding-worker/SKILL.md) per ready task, with a complete Task Contract and commit authority when the branch will be integrated;
2. await compact worker evidence;
3. dispatch sibling [`focused-validator`](../focused-validator/SKILL.md) after successful worker build/lint/test evidence when the admitted allocation requires task-scope independent validation;
4. return bounded findings to the original worker when available, otherwise a fresh worker with a complete compact handoff;
5. delegate each validated wave to one Integration Worker;
6. dispatch convergence-scope focused validation over the integrated result; and
7. advance the named integration baseline before creating or refreshing dependent worktrees.

The coordinator records only compact state, exact Atlas bindings, gate state, and locators in the map. Git, Atlas Decisions, repository state, accepted design, review artifacts, providers, and external systems remain authoritative.

Use [Recovery](references/recovery.md) for interrupted writers, repeated no-progress, repair routing, Atlas/source/map reconciliation, and successor stops.

Proceed when all tasks satisfy their exact admitted focused proof, are integrated in dependency order, and every accepted convergence obligation reached so far passes.

## 4. Apply The Admitted Proof Allocation

Use only the proof allocation admitted in the Delivery Contract:

- Atlas delivery: the imported current Map Decision's exact focused, convergence, review, E2E, security, cleanup, and ordering allocation;
- direct/ad hoc task: worker checks plus focused validation;
- bounded ad hoc coordinated change: task and convergence gates, with final review selected by explicit risk/release intent; or
- prototype: evidence answering the explicit question plus limitations.

For Atlas delivery, the imported allocation is authoritative. Software Implementation may add commands, environments, effect bindings, and evidence detail needed to execute a gate, but may not weaken, replace, reorder, OR-combine, or universally inflate it with generic release gates. An omitted generic architecture/quality/fidelity/full-security/E2E gate remains omitted unless the Map Decision or separately accepted successor requires it. Follow [Release Gates](references/release-gates.md) for execution mechanics without changing the accepted gate graph.

Proceed only when every gate currently due under the admitted graph has current evidence or its exact authority-bound typed limitation/blocker.

## 5. Prepare The Handoff Or PR

Perform the result Currentness Check before claiming completion. Delegate PR lookup/preparation/creation to the PR Operator in [Internal Roles](references/internal-roles.md) only with an exact PR Effect Binding. It must return an existing matching open PR for the same provider/account/repository/head/base rather than create a duplicate. PR authority never implies landing authority.

Return:

```markdown
Mode/outcome: <atlas | ad_hoc | prototype — delivered result>
Atlas binding/currentness: <exact Decision and result check, or not applicable>
Execution map: <stable locator>
Task waves: <completed waves and remaining non-blocking findings>
Convergence/proof gates: <evidence under admitted allocation>
Assumptions/typed limitations: <material exact items>
Handoff: <PR link | verified integration branch | exact blocker>
Merge/deployment: <separately authorized and performed elsewhere | not authorized>
Landing: <separately authorized and performed elsewhere | not authorized>
```

Completion never claims Map completion or authoritative landing. A result cites the exact Atlas Decision consumed and its verified currentness; it never treats source completion as permission to mutate Atlas.