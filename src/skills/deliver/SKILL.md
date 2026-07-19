---
name: deliver
description: Guides implementation of one accepted Route revision through bounded Leg execution, integration, independent verification, materiality triage, and truthful completion. Use only after a Route is explicitly accepted and implementation is separately authorized.
---

# Deliver

Semantically execute one accepted Route revision without becoming an implementation control plane. Deliver guides a Marshal coordinating Hand work and Clerk checks; Workflow Runtime, source systems, and concrete tools retain execution truth.

## Admit Or Resume

Use an explicit Casebook workspace root when present; otherwise use `.casebook/` in the current project. Create or resume `delivers/<deliver-id>/deliver.md` using [State](references/state.md).

Admit only when:

- one exact accepted Route revision and its accepted Blueprint revision are resolvable;
- implementation scope and effect authorization are explicit;
- the source/worktree boundary and configured source-system owners are known;
- no material accepted-route contradiction is already visible;
- this is a fresh Deliver identity rather than an in-place rebind from an invalidated Route.

Route acceptance alone does not authorize implementation, migration, destructive drills, deployment, publication, credentials, spend, shared-resource mutation, or live-authority mutation.

## Actor Boundary

- **Architect:** human owner of consequential design, judgment, dispositions, landing, and acceptance.
- **Steward:** maintains the Architect's Casebook interface and attention; never coordinates implementation semantics.
- **Marshal:** runs the delivery operation, selects eligible bounded work from the accepted Route, coordinates Hands and Clerk engagement, integrates evidence, and recommends progress.
- **Hand:** performs one bounded Work Item or authorized operation.
- **Clerk:** independently checks conformance, evidence, workmanship, and boundary compliance; the Marshal cannot overrule or suppress Clerk Findings.

Deliver is the capability, not an actor.

## Adaptive Loop

Derive the eligible Leg frontier from the accepted Route and current source facts. For each eligible Leg:

1. [Prepare](references/prepare.md) bounded Work Items and exact acceptance/effect boundaries.
2. [Execute](references/execute.md) through Hands and Runtime/concrete tools.
3. [Integrate](references/integrate.md) the Leg candidate at its named seam.
4. [Verify](references/verify.md) through independent Clerk checks and current integrated evidence.
5. [Triage](references/triage.md) every material Finding before advancing.
6. [Cleanup](references/cleanup.md) authorized temporary effects and verify settlement.
7. Recompute the frontier from accepted dependencies and source-system truth.

This is an adaptive semantic loop, not a fixed task scheduler. Runtime owns tasks, concurrency, cancellation, journaling, recovery, budgets, and settlement.

## Authority And Stops

Proceed autonomously only within the separately authorized implementation/effect boundary and accepted Route/Blueprint semantics.

Confirm before:

- implementation begins if not separately authorized;
- credentials, spend, installed/global harness mutation, shared resources, production/live authority, deployment, publication, destructive or hard-to-reverse effects;
- landing/merging when the configured workflow requires Architect authority;
- consequential design, trade-off, acceptance, scope, or external-system disposition;
- any effect whose authorization does not explicitly survive the current boundary.

A reviewer proposal remains an advisory Finding. Neither severity nor repeated agreement changes Blueprint, Route, package membership, proof protocols, or acceptance criteria without proper authority.

## Materiality Triage

Classify suspected semantic failure using [Triage](references/triage.md):

- clearly local under unchanged accepted assumptions → bounded repair;
- clearly material Route invalidation → terminate affected execution immediately;
- genuinely unclear → suspend the affected frontier for one bounded diagnosis, with no production repair or Blueprint/Route mutation.

Material invalidation closes this Deliver truthfully as `route-invalidated`, returns evidence to Route, and requires a fresh human-accepted Route candidate and fresh Deliver identity. Existing implementation is evidence or potential salvage only; it never carries forward automatically because it exists.

## Completion

Use [Completion](references/completion.md). Recommend completion only from current source-system-backed evidence when:

- the accepted Route revision remains valid;
- every required Leg is completed or has an accepted disposition;
- every completed Leg proves meaningful integrated behavior;
- Work Item results conform to Blueprint Contracts;
- required Clerk checks are complete;
- no unresolved Finding invalidates Route, Leg, Blueprint, or Destination claims;
- required cleanup is verified;
- source facts come from their owners;
- configured Delivery Map locators/evidence are current;
- required Architect dispositions or landing authority are explicit.

Deliver may instead end `route-invalidated`, `failed`, or `cancelled`. These are semantic session outcomes, not a duplicate execution-state machine.