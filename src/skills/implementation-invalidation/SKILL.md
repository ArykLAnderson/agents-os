---
name: implementation-invalidation
description: Reconciles implementation discoveries that conflict with accepted design or delivery authority without silent redesign.
---
# Implementation Invalidation: conform or reconcile

Implementation may discover facts; it does not acquire authority to reinterpret the accepted external boundary or architecture silently.

## Triage a discovery

0. Check readiness provenance. Production edits made while the governing Design/RFC Case was only route-selected; before a routeable Case revision was materialized and accepted as a fresh-worker-executable RFC; without the exact current accepted, configured-adapter-published Atlas Map Decision; or without an explicit current production dispatch naming that Decision and movement are a **readiness violation** even if behavior appears correct. Freeze them, preserve observations, and quarantine the commits as implementation terrain; they gain no presumption of reuse.
1. Capture the observed fact, environment/revision, affected Design/RFC Case claim and materialized RFC/Atlas item, impact, and smallest reproducer/evidence.
2. Classify it:
   - **Conformance repair:** implementation is wrong; repair and re-run affected proof.
   - **Evidence gap:** the design remains valid but required proof is absent; obtain it.
   - **Realization adjustment:** order/estimate/local mechanics change without changing a design decision; update the Atlas plan explicitly.
   - **Design invalidation:** responsibility, contract, state/authority, failure semantics, compatibility, or vertical route is wrong/missing; stop dependent work and return to Design.
   - **Boundary invalidation:** externally meaningful behavior/quality/scope is wrong or missing; return to Frame.
3. Record a disposition and affected downstream items. Do not patch around a design/boundary invalidation.

## Reconcile

For design/boundary invalidation: preserve the observation, mark affected Design/RFC Case claims and RFC/Atlas projections stale or superseded as applicable, revise atomic Case meaning in the owning lens, repeat only evidence invalidated by the change, re-review at the affected maturity, rematerialize the RFC document, and then rematerialize Atlas from the accepted current projection. For a readiness violation, return to the unanswered disposable prototype rung and complete the production transition gate before reconciliation. Keep already-valid implementation only if the reconciled design explicitly retains it through a separate salvage decision; prototype or premature production code gains no preference.

A review report, passing test, or worker consensus cannot silently convert an invalidation into a new requirement. Do not add a new ledger, gate, abstraction, or process merely because it was proposed: tie it to the observed failure and remove/replace a specific prior mechanism.

## Completion

The result names one of: conformed, evidence completed, Atlas realization update, Design/RFC Case reconciled with RFC and Atlas rematerialized, or Frame reopened. “Implemented differently but works” is not a terminal status.
