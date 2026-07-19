# Contracts

Refine a selected boundary's consumer promise to the depth required by actual use and material risk—not to checklist completeness.

Specify what materially affects consumers:

- operations and information available;
- inputs, outputs, invariants, ordering, and idempotency;
- state and authority context;
- expected revision, conflict, retry, and cancellation semantics;
- errors, partial outcomes, and recovery;
- privacy, trust, and disclosure behavior;
- observation and event semantics;
- configuration and capability assumptions;
- performance or scale limits when consequential;
- compatibility, migration, and retirement obligations;
- deliberate omissions and forbidden dependencies on implementation knowledge.

Prefer a small interface with substantial hidden behavior. A Contract is insufficient when a consumer must know storage layout, internal sequencing, hidden state, undeclared failure behavior, or another implementation Secret to achieve required behavior.

Use one real consumer at a time to discover missing semantics. Prototype or build an executable contract harness when prose cannot discriminate. Contract refinement does not authorize implementation.