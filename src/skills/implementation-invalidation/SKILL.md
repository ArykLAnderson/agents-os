---
name: implementation-invalidation
description: Reconcile implementation discoveries that conflict with accepted design or delivery authority without silent redesign.
---

# Implementation invalidation

Implementation may discover facts. It does not gain authority to reinterpret an accepted boundary, design, or delivery plan.

## Triage the discovery

First check readiness provenance. Production edits made before the governing design and current Atlas decision became dispatchable are a readiness violation even when the code appears correct. Freeze the work, preserve the observations, and treat the commits as implementation terrain. They gain no presumption of reuse.

Capture the observed fact, environment and revision, affected design claim or delivery item, impact, and smallest reproducer. Use the operational statuses in [../verification/references/claim-status.md](../verification/references/claim-status.md) for the supporting statements.

Classify the discovery:

- `conformance-repair`: implementation is wrong; repair it and rerun affected proof
- `evidence-gap`: accepted meaning may remain valid, but required proof is missing
- `realization-adjustment`: local order, estimate, or mechanics change without changing a design decision
- `design-invalidation`: responsibility, contract, state, authority, failure behavior, compatibility, or route is wrong or missing
- `boundary-invalidation`: externally meaningful behavior, quality, or scope is wrong or missing
- `readiness-violation`: production work began before its governing readiness and dispatch conditions held

Do not patch around a design or boundary invalidation.

## Propagate the correction

Use [references/correction-propagation.md](references/correction-propagation.md). Identify only the downstream claims and artifacts whose truth depends on the corrected fact.

A code repair invalidates proof that exercised changed behavior or relied on the corrected assumption. It does not invalidate unrelated evidence. An environment or test correction does not change accepted design unless the observed fact contradicts it. A design or boundary correction marks dependent implementation, proof, projections, and gates stale until the owning authority reconciles them.

## Reconcile

For a design or boundary invalidation:

1. Preserve the observation and its evidence.
2. Mark dependent claims and projections stale, superseded, or `invalidated` as their owning systems require.
3. Revise meaning in the owning Frame or Design/RFC Case.
4. Repeat only evidence affected by the correction.
5. Re-run the required review at the affected maturity.
6. Rematerialize the RFC and then the accepted Atlas plan when their source meaning changed.

For a readiness violation, return to the unanswered prototype or production-transition gate before reconciliation. Keep earlier implementation only when the reconciled design explicitly retains it through a separate salvage decision.

A review report, passing test, or worker consensus cannot create a new requirement. Tie every added gate, abstraction, or process to the observed failure and the prior mechanism it changes.

## Completion

Return the correction record and one result:

- `conformed`
- `evidence-completed`
- `realization-updated`
- `design-reconciled`
- `frame-reopened`
- `readiness-restored`

"Implemented differently but works" is not a terminal result.
