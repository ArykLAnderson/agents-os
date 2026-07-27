# Atlas handoff and materialization contract

Atlas is the **authoritative materialization of the accepted current delivery plan**. Do not maintain a parallel manual task list as competing truth.

Before RFC materialization/acceptance, Design may produce a **draft handoff candidate** from a fixed Design/RFC Case revision for routeability review. It contains the same input fields, marks every missing acceptance, owner, decision, or evidence item as a blocker, and is explicitly non-authoritative and non-materializable. It tests whether the plan is expressible without invention; it is not an Atlas projection.

At this boundary Blueprint must load and use `../../feature-atlas/SKILL.md`. Blueprint forms the source-bound candidate and does not create a second planning authority; Feature Atlas verifies and records acceptance/currentness through its domain operations and one configured adapter.

Actual Atlas materialization is allowed only after the routeable Design/RFC Case is projected through the document system, the Production Design RFC is accepted, every required input is fixed, and a verified human has unqualifiedly accepted the **exact complete current Map candidate** as a Feature Atlas `Decision — Map candidate`. That Decision must bind the exact Case/RFC/Blueprint revisions, expected predecessor, and current/superseding effect. The configured Feature Atlas Publisher/adapter must atomically record it against that expected predecessor, project the exact accepted snapshot, reread/verify the current Decision and projection, and return its receipt. A draft candidate, accepted RFC, tracker record, or local plan alone is not an accepted/published current Atlas plan.

## Input package

The materializer receives a fixed package:

- Design/RFC Case identity/revision, materialized RFC identity/revision, exact Blueprint binding, Frame boundary locator/revision, scope/exclusions, and the complete Map-candidate snapshot/identity; 
- verified-human exact Map-acceptance provenance, expected predecessor, required current/superseding effect, and configured Atlas destination/adapter identity;
- selected recognizable outcome and external guarantees;
- vertical route movements with owning feature/leg/work item (or equivalent), immediate consumer, direct prerequisites, owner, and convergence owner;
- current contracts/authority/state constraints that implementation must not invent;
- proof allocation, evidence references/limits, representative boundary failures, cleanup/recovery obligations;
- deferrals, invalidation triggers, and known limitations.

A draft candidate preserves ambiguous or missing inputs as named blockers. Reject actual materialization if any input is ambiguous, stale, unaccepted, cannot identify a consumer, owner, proof, or acceptance source, lacks an exact Map-candidate acceptance, lacks a predecessor/current binding, or cannot be published and reread through the configured adapter.

## Atlas current-plan projection

Use Feature Atlas domain operations and the configured adapter to materialize stable entities/links; Blueprint does not call provider tools, parse provider records, or write a parallel plan. Each work item must have exactly one owning vertical movement, its immediate consumer, direct consumer-owned prerequisites, proof responsibility, and a clear state. Preserve exact source links; Atlas does not copy or reinterpret claims.

Atlas records currentness/supersession and the materialized plan only. It does not accept architecture, dispatch workers, infer missing contracts, grant implementation/deployment authority, or turn evidence into acceptance.

## Update and invalidation

- An implementation **conformance repair** updates implementation evidence, not the RFC design.
- A **realization-only** change updates Atlas explicitly and keeps its RFC binding visible.
- A **design or boundary** conflict invokes `../../implementation-invalidation/SKILL.md`; mark affected plan items stale, reconcile in Design or Frame, then materialize an accepted successor/current projection.
- Never edit Atlas to hide a disagreement or make an implementation look conformant.

## Materialization receipt

Record: input identity/revisions; output Atlas IDs; current/superseded decision linkage; entities/links written; validation/reread result; unresolved limitations; and operator/tool identity. A receipt proves projection mechanics, not semantic acceptance.
