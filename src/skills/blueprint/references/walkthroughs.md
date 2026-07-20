# Consumer Walkthroughs

Walk every new or materially changed module boundary through each materially different consumer class before Blueprint acceptance.

Use only the proposed Contract and declared context. For each walkthrough record:

- consumer and required behavior with pinned Case revision;
- starting information, identity, authority, and state;
- Contract operations used in order;
- state, schema, trust, and authority crossings;
- expected observations and durable outcomes;
- material conflict, stale-reference, privacy, duplicate, crash, retry, cancellation, and recovery paths;
- canonical owner of each mutation and how derived observations reconcile;
- undeclared knowledge or implementation Secrets the consumer was forced to assume;
- missing or excessive Contract surface; and
- evidence, limitations, and disposition.

Cover consumer classes with meaningfully different authority, lifecycle, failure, or deployment needs rather than every caller. A happy-path example is not sufficient when the design depends on failure-boundary behavior. Do not multiply walkthroughs that exercise the same material Contract semantics.

Missing semantics return to Contract or candidate shaping. Ambiguous ownership or competing definitions return to canonization. Behavioral ambiguity that would materially change the accepted boundary returns to Frame/Case reconciliation; design-local ambiguity stays in Blueprint. Realization ordering becomes a Route question. Claims that prose cannot discriminate return to Prototype.

Retain failed walkthroughs as design evidence rather than rewriting history. Walkthrough sufficiency means every materially distinct consumer can complete accepted behavior and relevant recovery without undeclared implementation knowledge; it is evidence, not a ritual count.
