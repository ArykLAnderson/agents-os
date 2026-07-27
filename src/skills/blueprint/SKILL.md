---
name: blueprint
description: Designs a coherent, consumer-sufficient engineering architecture and vertical delivery route from an accepted external boundary.
---
# Design: Blueprint <-> Route, not stages

Admit an accepted/current Frame boundary. Preserve the distinction:

- **External technical boundary:** consumer-visible guarantees and constraints inherited from Frame.
- **Internal machinery:** responsibilities, contracts, state placement, algorithms, schemas, implementation sequence, and tooling. Design selects only machinery required by the boundary and observed terrain.

## Work the two lenses together

**Blueprint lens:** inspect current terrain and select one coherent responsibility/contract/state design. Name canonical owner for material state, mutation, contracts/schemas, and recovery/operation where relevant. Walk the immediate consumer and representative failure paths.

**Route lens:** ask whether one vertical route can produce a recognizable outcome without a worker choosing missing behavior, ownership, contract, schema, or architecture. Define only the necessary delivery movements, direct prerequisites at their consumers, convergence owner, and proof. Test routeability primarily through an analytical fresh-worker walkthrough of the Frame, prototype evidence, atomic Design/RFC Case claims, owners, failure semantics, and route—not by implementing the route again or drafting prose prematurely. A routeability gap returns to Blueprint; a behavior gap returns to Frame; only an evidence-dependent architecture unknown commissions another narrow probe.

Use a prototype when a proposition materially determines authority, persistence, an external process/API, restart/recovery, compatibility, or the chosen route. Do not treat passing component checks as a substitute for the immediate consumer exercising the callable seam.

## Surface consequential choices

Design may autonomously explore and recommend candidates. Before one becomes accepted or implementation-authoritative, surface a bounded human decision when it selects/replaces durable state or authority ownership, changes an accepted RFC/Atlas dependency, chooses among credible architectures with materially different cost/operability/constraints, fixes a hard-to-reverse interface/persistence/compatibility contract, or decides salvage after invalidation. Include the recommended choice, material alternative(s), trade-off, and exact consequence of acceptance.

Do not interrupt for a conformance repair forced by accepted design, a disposable prototype direction, or reversible local mechanics that change no responsibility, authority, contract, or interface. Keep such work autonomous and record only decision-changing evidence.

## Design/RFC Case and document gate

During exploration, curate one Design/RFC Case using `templates/design-rfc-case.md`; do not maintain a parallel prose RFC draft. The Case stores atomic semantic claims only: responsibility/state/authority owners, consumer contracts, invariants, failure/recovery semantics, evidence and limits, rejected alternatives, unresolved questions, and route implications. Mark each claim `selected`, `provisional`, `blocked`, `refuted`, or `deferred` and retain provenance from Frame authority, human decision, prototype evidence, accepted architecture, or terrain.

Track readiness on the Case:

- **Route-selected:** the current semantic design and route are inspectable, but named evidence, ownership, authority, or no-invention claims remain provisional/blocked.
- **Fresh-worker executable candidate:** every consequential claim is selected, evidence-dependent claims are supported, owners/consumers/failures are closed, and a fresh worker walkthrough finds no architecture invention.

Only after routeability, invoke `../document/SKILL.md` to materialize `templates/production-design-rfc.md` as a **lossless reader-facing projection** from one fixed Design/RFC Case revision. In this bounded invocation, the Case remains the sole semantic design authority: Document may govern editorial organization, prose, trace, review, and representation, but may not add, select, reinterpret, or change a semantic design claim. Any semantic discrepancy or requested semantic change returns to the Case first; fix and re-reconcile its claims, fix a new revision, then rematerialize. Review findings reconcile into Case claims, never directly into the RFC. Only an accepted fresh-worker-executable RFC projection may proceed to Atlas.

## Hard production transition

A **route-selected Design/RFC Case forbids production source edits**. Existing implementation authority, Atlas work items, old handoff verbs, passing component tests, integration branches, and sunk code do not override this. Treat all prior dispatch language as suspended terrain while Frame/Design reconciliation is active.

Before changing production source, require all of:

1. when decision-changing consequential uncertainty remains, the smallest disposable evidence that can resolve it (a thin recognizable outcome across those uncertain seams when that is the discriminating shape), reusing prior evidence or skeletal fixtures for settled seams; when no such uncertainty remains, no prototype or tracer is required;
2. targeted stress evidence only where the selected real seam and accepted boundary make it decision-relevant;
3. analytical immediate-consumer and representative applicable failure walkthroughs, plus closed contracts, owners, failures, and route with no worker invention;
4. applicable advisory findings reconciled and resulting current blockers resolved;
5. a fixed routeable Case revision is materialized as an RFC and accepted as `fresh-worker executable`;
6. an exact current accepted and configured-adapter-published Atlas Map Decision bound to that RFC/Case, and an explicit current production dispatch naming that Decision and production movement.

Until then, decision-seeking code must live in an explicitly disposable location with a stop condition and cleanup. Code expected to survive is implementation and cannot be relabeled as a prototype after creation. Never issue an implementation subagent prompt to discover architecture.

Default working artifact budget: update the effort's one boundary/evidence notebook and one Design/RFC Case. Fold contract-delta checks, terrain conclusions, prototype verdicts, review dispositions, and invalidations into those artifacts. Do not hand-maintain RFC prose during exploration; materialized previews are disposable until acceptance. Keep raw reports temporary unless independently required by authority, non-repeatable evidence, interruption recovery, or a named downstream consumer. Preserve enough for lossy resumability, not a perfect reasoning trace.

It is ready to accept only when it provides:

- analytical immediate-consumer and representative applicable failure walkthroughs for the accepted boundary;
- disposable evidence for each decision-changing consequential uncertainty, while settled seams are explicitly bounded by prior evidence or fixed fixtures;
- clear state and authority ownership;
- one selected design with material alternatives/rejections and limitations visible; and
- a vertical route that a fresh worker can follow without architecture invention.

Apply the proportional review ladder in `README.md`. Early prototypes default to self-check or one `review-mandates/prototype-light.md` generalist; add a focused specialist only for a named material seam. At RFC readiness use `review-mandates/rfc-design.md`; add `boundary-envelope.md` only when the selected route crosses external process/API, persistence/restart, security/privilege, or comparable material boundary. When security review is concretely warranted, use an exhaustive finder only with `review-mandates/security-disposition.md` or an equivalent contextual disposition step. Do not make the final-RFC review set the default for earlier prototype rungs.

Reviewers report advisory findings; they do not accept, reject, or set readiness. After all applicable reviews, Design must run one explicit reconciliation against the accepted Frame, current goals, phase, threat model, evidence, selected architecture, and prototype proposition. For every consequential finding, record one disposition: immediate boundary violation/conformance repair; seam required now; evidence required now; deferred enforcement/hardening; design or behavior proposal; or irrelevant/invented requirement. State the resulting Case-claim consequence or `none`. Only this reconciliation—and human authority where the disposition changes a consequential guarantee or design choice—may alter Case meaning, route, readiness, or acceptance. Rematerialize any RFC projection after Case meaning changes; never patch the projection as a competing authority. Preserve unresolved evidence conflicts without allowing reviewer preference to become a requirement.

Before acceptance, use `contracts/atlas-handoff.md` only to form a non-authoritative draft handoff candidate from the fixed Case revision and expose blockers. At the Atlas boundary, load and use `../feature-atlas/SKILL.md`: Blueprint supplies the exact source-bound Map candidate, while Feature Atlas verifies exact Map acceptance, predecessor/current binding, and configured-adapter publication. On routeability, materialize the RFC projection through the document system; after exact Map acceptance, publish the exact current delivery plan through that adapter. Atlas is authoritative thereafter for the accepted delivery plan; it is not a parallel design authority. The accepted RFC is the pinned reader-facing architecture projection, and its Design/RFC Case remains the semantic provenance source.
