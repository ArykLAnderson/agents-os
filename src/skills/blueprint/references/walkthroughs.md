# Consumer Walkthroughs

Walk every new or materially changed boundary through each materially different consumer class before Blueprint acceptance.

Use only the proposed Contract and declared context. For each walkthrough record:

- consumer and required behavior;
- starting information, identity, authority, and state;
- Contract operations used in order;
- state and authority crossings;
- expected observations and durable outcomes;
- material conflict, stale-reference, privacy, duplicate, crash, retry, and recovery paths;
- undeclared knowledge the consumer was forced to assume;
- missing or excessive Contract surface;
- evidence, limitations, and disposition.

Cover consumer classes with meaningfully different authority, lifecycle, failure, or deployment needs rather than every caller. A happy-path example is not sufficient when the design depends on failure-boundary behavior.

Missing semantics return to Contract or candidate shaping. Behavioral ambiguity returns to Frame/human reconciliation. Claims that prose cannot discriminate return to Prototype. Retain failed walkthroughs as design evidence rather than rewriting history.