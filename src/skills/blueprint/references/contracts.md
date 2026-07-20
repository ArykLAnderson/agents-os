# Contracts

Refine a selected module's consumer promise to the depth required by actual use and material risk—not to checklist completeness.

Specify what materially affects consumers:

- operations and information available;
- inputs, outputs, invariants, ordering, and idempotency;
- states, transitions, canonical state/mutation authority, and authority context;
- expected revision, conflict, retry, cancellation, and concurrency semantics;
- errors, partial outcomes, failure containment, and recovery;
- privacy, trust, and disclosure behavior;
- observation and event semantics;
- configuration and capability assumptions;
- performance or scale limits when consequential;
- compatibility, migration, and retirement obligations;
- exchanged or persisted schemas, evolution rules, and canonical definition locators; and
- deliberate omissions and forbidden dependencies on implementation knowledge.

Prefer a small Contract with substantial hidden behavior. A Contract is consumer-sufficient when each materially different consumer can achieve accepted behavior, handle relevant failure/recovery, and observe required outcomes using only the Contract and declared context. It is insufficient when a consumer must know storage layout, internal sequencing, hidden state, undeclared failure behavior, schema internals, or another implementation Secret.

Name one canonical owner and definition for every material Contract, state machine, and schema. Mirrors, caches, protocol bindings, generated forms, and Document diagrams are derived views; state their source and reconciliation rule. When old and new Contracts coexist, identify which is canonical in each phase and what prevents split authority. Do not let a diagram, type copy, or compatibility adapter silently become a competing definition.

Use one real consumer at a time to discover missing semantics. Prototype or build an executable Contract harness when prose cannot discriminate. Stop when consumer and ownership sufficiency are established for material paths; do not prescribe private algorithms or Route sequencing. A genuinely inapplicable dimension may be recorded as justified `N/A`; an unknown or deferred semantic is a Finding, not `N/A`.

Contract refinement does not authorize implementation.
