# Feature Atlas Storage Adapter Contract

Feature Atlas semantics, identities, Decisions, currentness, and typed handoffs are canonical. Storage is a configurable port. One configured adapter realizes the exact Atlas destination without exposing provider mechanics to Route or Software Implementation.

This is a semantic port, not a mandatory runtime API or universal record schema. An implementation may choose different function names and representations only if it preserves the operations, inputs, outcomes, and failure behavior below.

## Configuration And Capability

Adapter configuration binds:

- adapter kind/version and exact destination identity;
- expected visibility, audience, retention, and access policy;
- configured trusted human authority/provenance verifier;
- representation codec/version that losslessly preserves the canonical Atlas representations;
- immutable Decision/snapshot retention and locator strategy;
- identity search/allocation, expected-predecessor or CAS, reread, receipt, and uncertain-write recovery capabilities; and
- disclosure policy for qualified evidence and observations.

Atlas adapter selection is independent of Case/Frame persistence selection. `CASEBOOK_DATABASE_URL` has no Atlas meaning. An explicit Atlas destination wins; otherwise the configured local-machine default is the current project root's `.casebook/atlas` directory through the local filesystem adapter. Report destination ambiguity only when neither an explicit destination nor that project-local default resolves safely.

`inspectStore()` returns adapter identity/version, exact destination, observed visibility/access, codec, capability evidence and freshness, and a receipt. Mismatch or unproven required capability fails closed. No caller may select a convenient fallback adapter, destination, account, repository, or root.

## Domain Operations

A verified Acceptance Package supplies semantic authority for `recordMapDecision` and `projectAcceptedSnapshot`. The mutation authority passed to those operations is the configured Publisher/adapter's operational permission to perform the already-authorized projection, not a second human approval. If operational permission is missing or fails verification, return a typed publication failure without reinterpreting it as missing Map acceptance.

The Feature Atlas domain exposes these operations to Route, Publisher, Software Implementation, and other semantic consumers:

- `readEntity(exact Atlas identity, entity identity)` — resolve stable domain identity, owner, canonical locator, accepted local-label binding, current Decision, and projection state.
- `readMapDecision(exact Atlas/Map/Decision)` — retrieve and verify immutable Decision content or its lossless content-bound snapshot, predecessor/current effect, acceptance provenance, Blueprint bindings, and authority boundary.
- `readCurrentMap(exact Atlas/Map)` — return the sole current Decision identity plus complete current projection/publication state; ambiguity or multiple current Decisions is conflict, not a chosen winner.
- `inspectDependency(exact consumer edge/endpoint)` — return the accepted consumer-owned edge, observed provider Decision, satisfaction-source/freshness/invalidator information, and resolvability.
- `verifyPublication(exact Atlas/Map/Decision)` — reread Decision and projections and classify `complete_consistent | incomplete | conflict | unverifiable`, with immutable evidence/receipt.
- `exportExecutionHandoff(exact Atlas/Map/Decision)` — only after the above reads, return Route's typed `HandoffReady | HandoffWithLimitations | HandoffRefusal` with all canonical identities, bindings, proof allocation, evidence qualification, limitations, invalidators, publication/currentness, and absent authorities. This is the only Atlas admission surface for Software Implementation.
- `recordMapDecision(acceptance package, expected predecessor, mutation authority)` — atomically with respect to the adapter's concurrency boundary verify expected predecessor and append one immutable Decision, or return a typed stale/conflict/uncertain failure. It never chooses meaning.
- `projectAcceptedSnapshot(exact Decision, durable label bindings, expected projection predecessor, mutation authority)` — mechanically create/reuse identities, project children/edges then Feature/Map current views, and return complete or truthful partial receipts.
- `appendQualifiedObservation(exact affected Decision/field, source authority package, mutation authority)` — verify source/initiator/provenance/integrity and append only the minimum accepted observation form; unverifiable facts remain `unknown`.
- `rereadReceipt(receipt)` / `recoverPartial(receipt, exact Decision, mutation authority)` — determine whether an uncertain write occurred, reuse established identities/Decision, and resume without duplicate semantic records.

Every read is by exact stable identity. Convenience discovery may aid a human in choosing an identity but cannot replace an exact operation or silently follow `latest`.

## Adapter-Owned Mechanics

The configured adapter alone owns:

- exact provider destination, account/root/repository identity, visibility and access checks;
- authentication capability and trusted-authority provenance verification plumbing;
- exhaustive identity/Decision search and collision handling;
- provider reads/writes, expected-predecessor/CAS or equivalent serialization;
- immutable Decision/content recording and durable locator creation;
- provider-native current projections, navigation, visibility, and retention;
- rendered/content reread, integrity comparison, receipts, and uncertain-write recovery; and
- translation between provider records and canonical Atlas domain values.

A provider locator, issue number, filename, native parent, label, branch, commit, blob, or content digest can prove storage identity/integrity only. It never defines Atlas identity, owner, acceptance, currentness, prerequisite satisfaction, lifecycle completion, or authority.

## Required Failure Semantics

Return typed, evidence-bearing failures; do not downgrade them to empty results:

- `destination_mismatch | visibility_mismatch | access_unverified | capability_unproven`;
- `identity_ambiguous | identity_collision | owner_conflict | binding_conflict`;
- `authority_unverified | content_integrity_failure | retention_unverified`;
- `historical_decision | stale_expected_predecessor | multiple_current_decisions`;
- `publication_incomplete | decision_projection_conflict | dependency_unverifiable`; and
- `write_uncertain | partial_publication`, with successful locators, failed operation, pending projections, and safe recovery input.

The domain maps these facts to acceptance/publication stops and typed handoffs. The adapter does not infer semantic equivalence, choose successors, amend Decisions, grant effects, or dispatch implementation.

## Consumer Boundary

Route and Software Implementation call Feature Atlas domain operations. They do not run `gh`, enumerate provider issues, parse an unselected provider layout, select Git branches, or treat mutable files as currentness authority. Publisher may use domain mutation operations under exact authority; only the adapter implementation uses provider commands/APIs/files. When the selected local filesystem adapter has no dedicated executable, the Feature Atlas skill itself may execute these adapter-owned reads with filesystem tools under the rules in [the configured local filesystem adapter](configured-local-filesystem.md); this is adapter execution, not consumer-side path inference.

Switching adapters changes storage mechanics and locators, not Atlas vocabulary or semantic authority. Migration between adapters is separately accepted and authorized work with exact source/destination Decisions and integrity proof; it is never an implicit fallback.
