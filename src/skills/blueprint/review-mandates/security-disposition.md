# Security finding and contextual disposition mandate

**Use:** when security review could influence a Prototype, Production Design RFC, boundary envelope, or route.

## 1. Exhaustive finder

The security finder may be intentionally broad and mechanical. Report observed conditions, concrete risk, triggering capability/threat, evidence, confidence, affected seam, and potential consequence. Seek large avoidable mistakes and places where later security would require architectural replacement.

The finder is advisory. It does not accept or reject a prototype/RFC, set readiness, expand the threat model, or turn final-product hardening into a current requirement. Do not suppress a valid finding merely because enforcement is deferred.

## 2. Contextual disposition

A separate reviewer or explicit Design reconciliation must evaluate every consequential security finding against:

- accepted Frame guarantees and exclusions;
- current goals and immediate consumer;
- phase: disposable prototype, trusted-local MVP, production, or hardened deployment;
- accepted threat model and authority boundary;
- selected architecture and prototype proposition;
- evidence quality and consequence of deferral; and
- whether deferral preserves a credible path to later enforcement without architectural replacement.

Assign exactly one disposition:

- **immediate boundary violation / big mistake** — contradicts a current guarantee or creates a material avoidable risk inside the accepted threat model; repair or reopen the owning lens now;
- **seam required now** — define the interface, ownership boundary, or state contract now so later security is possible without replacing the architecture, while deferring enforcement not required by the current phase;
- **evidence required now** — a current security or containment claim remains unproved;
- **deferred enforcement / hardening** — useful or necessary for a later threat model but not a current blocker;
- **design or behavior proposal** — changes architecture, guarantees, scope, or authority and requires owning-lens reconciliation plus human authority when consequential;
- **irrelevant or invented requirement** — outside current goals/threat model/proposition or unsupported by evidence.

For each disposition, state the current design/readiness consequence or `none`, the later trigger when deferred, and the seam that preserves future hardening where applicable.

## Phase calibration

Early trusted-local prototypes and MVPs primarily use security review to discover securable seams and catch large mistakes. They need not implement final hostile-code isolation, privilege separation, sandboxing, multi-tenant defenses, or comparable enforcement unless the accepted boundary requires it. A future isolation interface may be required now even when actual isolation is deliberately deferred.

Prototype absence of a production control is not evidence of infeasibility when the proposition is to create or test that seam. Conversely, `disposable` does not excuse an effect outside current authority, contamination of production/live state, credential exposure, or a major mistake already inside the accepted threat model.

## Authority

Raw security findings never reject work. The contextual disposition feeds Design reconciliation; only that reconciliation, accepted Frame authority, and human authority where required may change design, readiness, route, or dispatch.
