# Test Portfolio Retention Rubric

## Retain a deep-seam test when

- it crosses a stable public interface into a deep module;
- it proves an externally meaningful outcome or durable authority transition;
- it is the strongest owner of a race, ambiguity, custody, or destructive-operation invariant;
- replacing internal structure would leave the contract unchanged.

Prefer one scenario that crosses several internal layers over one test per internal function.

For acceptance-level specifications, apply the portability test: could a sound implementation in a different language, framework, storage system, or internal architecture satisfy the same specification? Flag names that unnecessarily expose tables, columns, internal functions, module paths, queues, cache keys, environment variables, or framework names. Domain vocabulary and user-visible behavior are correct; API contract tests may name the public protocol, and focused unit tests may name the implementation they isolate.

## Retain a focused test when

The code is both critical and cheaper or clearer to isolate than to drive through the full seam. Typical exceptions:

- cryptographic verification and context binding;
- path traversal, archive, or namespace admission;
- replay, fence, token, actor, or revision binding;
- credential and secret redaction;
- deterministic policy classifiers;
- bounded-history or compaction algorithms;
- malformed protocol classification and permanent quiescence.

Retain the smallest representative failure set. Status codes, error phrases, and equivalent branches do not each need a test unless they establish different authority outcomes.

## Delete when the test primarily proves

- a private field, stored object, queue, event name, or phase layout;
- a helper/function/class exists or was called in a particular order;
- generated source contains text fragments;
- package exports or constants mirror another declaration;
- each thin client method maps to an expected URL/body;
- each presentation variant renders expected prose;
- each historical ticket or delivery slice still has a test;
- multiple layers independently own the same behavior;
- manually fabricated state reaches an implementation checkpoint rather than a public outcome;
- a matrix varies inputs without changing the contract or authority result.

## Consolidate when

- variants share one authority boundary and differ only in input rows;
- normal and fail-closed outcomes belong to one public lifecycle;
- several destructive preconditions can be expressed as a bounded table;
- adapter translation needs one completeness case rather than one case per command.

Consolidation must reduce setup and ownership duplication. A large parameter table that preserves every historical branch is not cleanup.

## Detect owner gaps

Before deleting the last test for important behavior, ask:

1. Which public seam should own this invariant?
2. Does an existing test reach that seam?
3. Does it assert the authority outcome, not merely a projection?
4. Is ambiguity or delayed completion covered?
5. If an external deletion succeeds but absence verification fails, is authority retained?
6. Can a stale asynchronous result overwrite a newer lifecycle fence?
7. Does due automation both execute and reschedule after deferral?
8. Does failed artifact capture preserve the provider and canonical pointer?
9. Are confirmation and destructive actions bound to actor, target, intent, revision, and expiry?

If the answer exposes a gap, create or preserve one compact owner before deleting the weak test.

## Portfolio smell indicators

Investigate aggressively when:

- a test file is larger than the production module;
- suites are named after ticket, slice, milestone, or chronology;
- the same scenario exists at unit, route, adapter, and E2E layers;
- fixtures repeatedly mutate durable state directly;
- suite growth is proportional to commands or functions rather than seams;
- refactoring private structure causes widespread test edits;
- test runtime count cannot be explained from an ownership map.

## Evidence standard

Claims of safe deletion require commands actually run after the final wave. Record exact counts and outputs. A reviewer saying coverage “looks sufficient” is not substitute evidence; a green suite alone is not proof of good ownership. Require both execution evidence and an independent owner-gap challenge.
