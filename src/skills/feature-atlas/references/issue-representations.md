# Canonical Feature Atlas Representations

These are readable semantic representations, not a rigid Markdown schema. A configured adapter may use sections, linked records, or native navigation when a fresh consumer can recover the same authority, ownership, currentness, prerequisites, proof, and limitations without knowing mutation order or Route scratch state.

## Identity And Ownership

- Domain IDs are stable and independent of issue numbers, titles, repositories, paths, branches, and chats.
- Allocate Atlas-scoped readable sequences: `FA-*` Atlas, `AIS-*` Index Segment, `FM-*` Map, `F-*` Feature, and `WI-*` Work Item. Numbers carry no meaning and never encode ownership. Legs are Feature-contained accepted structures by default and have no global ID kind.
- Search open/closed records and comments exhaustively before allocation and immediately before creation. Never recycle an ID. A tentative allocation becomes durable only after successful create/reuse plus reread binds `(Map Decision, candidate-local label)` to it.
- Every Map has exactly one Atlas owner. Every Feature has exactly one Map owner. Every implementation Work Item has exactly one Feature owner and one owning Leg label. Dependencies and convergence never change ownership.
- Rehoming preserves identity only through its own trusted named-human Atlas Decision. Record old/new owner, consequence, and current Map Decision before changing the current projection.
- Cross-Atlas references pair Atlas and entity identity, such as `FA-001 / F-014`, plus canonical locator.
- Native tracker parentage, labels, index membership, and locators are navigation only.

Ordinarily one governing Blueprint identity has one stable Map. Referenced provider Blueprints retain separate Maps. Same-Blueprint/same-destination successors preserve `FM-*`; a fundamentally changed governing Blueprint or destination through split/combination/replacement requires a separate human/Blueprint disposition and new Map.

## Authority, History, And Current Projection

The Issue body is a current operable projection. Comments/history retain immutable Decisions, corrections, material changes, and consequential observations. A fresh reader should not replay the entire history, but the body never outranks the current Map Decision.

Only a clearly headed `Decision — Map candidate` whose configured trusted Atlas provenance verifies the accepting human's identity and bounded authority for the exact Blueprint/Map question grants accepted planning authority. Display names, prose, issue creation, edits, labels, links, native relationships, agent output, reviews, status, and silence do not.

A Map Decision contains or losslessly references the complete accepted Map candidate; identifies the human/provenance/date, bounded question, exact choice/rationale, Map and exact Blueprint bindings, expected predecessor, current/superseding effect, consequences, and non-authority; and preserves the candidate-local labels used for mechanical stable-ID binding. Externally stored snapshots require a Decision-contained cryptographic binding over canonical bytes/content type and an immutable/versioned/durable/audience-compatible lifetime locator. Inline immutable Decision content needs no universal digest.

Use this minimum semantic form:

```markdown
## Decision — Map candidate

- **Accepted by / verified authority provenance:** <human and configured trusted provenance>
- **Date:** <YYYY-MM-DD>
- **Question and exact choice:** <bounded question and unqualified accepted candidate>
- **Map:** <proposed or stable FM identity and locator>
- **Blueprint bindings:** <governing and referenced exact accepted revisions/locators>
- **Predecessor / current effect:** <Decision locator or None; current/superseding statement>
- **Accepted snapshot:** <inline package or immutable locator plus required external content binding>
- **Rationale and consequences:** <including changed/preserved meaning for a successor>
- **Authority boundary:** planning projection only; implementation/effects/PR/merge/deploy remain separate
- **Next step:** <mechanical publication/recovery action>
```

Exactly one accepted Map Decision is current. A successor Decision itself names its exact predecessor, superseding reason, and current effect. Prior Decisions remain immutable and visible. During partial projection, the Decision remains semantic authority; bodies and children may truthfully report `publication incomplete` but must not contradict it.

Before any material body change, append the applicable Decision, `Clarification`, `Material change`, or verified observation record, then mechanically refresh the body. Correct historical errors with a new correction; never silently rewrite accepted history. Reviewer output is advisory and cannot grant or change authority.

## Atlas Root And Index

Keep the Atlas root small: stable identity, configured private canonical destination, canonical locator, current Index Segment, enduring purpose, shared invariants, and direct Map ownership. Do not copy Map content/history into it.

An `AIS-*` Index Segment is bounded navigation only. It names its Atlas, current/superseded state, adjacent segments, and Map links. Rotation is readability-driven; it never creates a new Atlas or changes Map ownership. Keep exactly one current segment under adapter policy.

## Feature Map Current Projection

A Map owns accepted Blueprint-to-delivery planning and supplies:

```markdown
# FM-<NNN> — <Map name>

| Field | Current value |
|---|---|
| **ID / Atlas owner / canonical locator** | <stable IDs and locators> |
| **Current Map Decision** | <immutable Decision locator> |
| **Publication state** | Complete / Incomplete / Conflict |
| **Lifecycle / attention** | <current attention only; not automatic completion authority> |

## Destination, scope, exclusions, terrain basis, and current next action
## Governing and referenced Blueprint bindings
## Current accepted snapshot, predecessor/successor, and invalidation summary
## Blueprint coverage, retained states, and deferrals
## Selected strategy and rejected-decomposition rationale
## Features and exact ownership navigation
## Cross-Feature prerequisites and sequencing
## Consumer-owned cross-Map prerequisites
## Convergence and joint-proof obligations
## Evidence profile and qualified reuse records
## Contextual E2E and security guidance
## Publication limitations, source-system locators, and authority block
```

The Map does not copy every Feature Work Item edge. A Map-owned convergence/joint-proof obligation is not a Map-owned implementation Work Item; executable work remains in an identified Feature Leg. Work Item closure, passing evidence, observations, or body/status edits do not establish Map completion or abandonment; that lifecycle authority/workflow is separately undefined.

## Feature Current Projection

A Feature is ordinarily one behaviorally coherent, independently mergeable PR/E2E boundary. Its body is a projection of the current Map Decision and receives no separate decomposition acceptance.

```markdown
# F-<NNN> — <Feature name>

| Field | Current value |
|---|---|
| **ID / Atlas / Map owner / canonical locator** | <stable IDs and locators> |
| **Accepted Map Decision / local-label binding** | <Decision and label> |
| **Projection / lifecycle attention** | <current state> |

## Outcome, immediate consumer, and observable acceptance
## In/out boundaries and ordinary PR/E2E boundary or justified exception
## Starting and resulting coherent state
## Contained Legs
### <Leg label> — <integrated behavioral movement>
- <consumer, Contracts, before/after, Work Items, prerequisites, convergence, evidence, risk, compatibility, temporary mechanism/cleanup, invalidators>
## Accepted Work Item DAG
## Feature-owned convergence and external prerequisites
## Compatibility, rollback/abandonment, evidence, risks, and invalidators
## Verification, contextual E2E, and security allocation
## Current source-backed state, limitations, and next action
```

Leg labels are stable only within one accepted snapshot. Preserve a label in a successor only when behavioral meaning and Feature ownership remain materially unchanged; otherwise use a new label and record the disposition. An adapter may add separate Leg navigation but cannot add authority or alter Feature ownership.

## Work Item Current Projection

```markdown
# WI-<NNN> — <Work Item name>

| Field | Current value |
|---|---|
| **ID / Atlas / Feature owner / owning Leg** | <stable IDs, locators, Leg label> |
| **Accepted Map Decision / local-label binding** | <Decision and label> |
| **Projection / lifecycle attention** | <current state> |

## Responsibility, bounded context, immediate consumer, and Blueprint coverage
## Current behavior and desired coherent result
## Key interfaces and explicit in/out boundaries
## Dependencies
- **Blocked by:** <direct concrete IDs/endpoints and canonical locators, or None>
## Convergence point and owner
## Evidence output and authoritative source locator expectations
## Focused proof and intended independent checker
## Integrated/E2E/security allocation and honest independence limitations
## Temporary-mechanism disposition, current source-backed state, and next action
```

Do not store an independently mutable `Blocks` list. Reverse impact is a derived view citing its source consumer and observation time. A Work Item exporting a seam proves immediate-consumer sufficiency; activity and internal completion alone are insufficient.

Reuse a stable `WI-*` in a successor only when owner, responsibility, boundaries, consumer, and acceptance meaning remain materially unchanged. Otherwise disposition the old item and allocate a new ID. Stable IDs are never recycled.

## Dependency And Convergence Representation

A prerequisite is canonical once at its blocked consumer. Work Items own direct implementation edges; Features/Maps own external and cross-boundary edges without duplicating internal graphs. A cross-Map prerequisite records consumer and Decision; provider Atlas/Map/Feature and exact endpoint; observed provider Decision; satisfaction test/source/time; freshness/compatibility/invalidators; unavailable impact; convergence use; and revalidation.

Reverse `blocks`/impact views are derived and may be stale. Provider acceptance, completion, or broad proof is not consumer-specific endpoint satisfaction.

Every convergence has one Map or Feature owner, input endpoints/source owners, compatibility assumptions, integration/observation boundary, joined evidence, intended independent checker, contextual E2E/security/cleanup, failure route, and downstream consumer.

Graphs must be visibly acyclic over decision-visible nodes and concrete endpoints. Provider internals remain opaque. Unknown/inaccessible/ambiguous/unresolvable endpoints prevent acceptance; no global graph, locking protocol, or graph engine is implied. Runtime/domain feedback to a future planning run is labeled `behavioral feedback — not blocked by`, not encoded as a cycle.

## Evidence, Observations, And Source Truth

An Evidence Reference names source owner/locator, producer/time/kind, subject/question, revision/build/data/environment/baseline/configuration, method/result/limits, target obligation, invalidators/freshness, applicability/remaining gap, revalidation, and audience limits. Reuse is qualified input only; it never inherits acceptance, authority, independence, completion, or live-provider status.

A retained factual observation is eligible only when an authenticated/scoped owning workflow or source authority initiated it and authentication, authorization, provenance, source locator/environment, audience, and integrity were verified. It records Map Decision/affected field, initiator/adapter, source owner/locator/revision/environment, time, method/result/limits/evidence, disclosure, and superseded-current-view relation. Failure remains `unknown`. Observations may apply an already accepted factual rule but cannot amend meaning, create a pass/readiness verdict, or establish lifecycle completion.

Git, source repositories, tests, reports, PR providers, deployments, runtimes, and external providers remain authoritative for their facts. Atlas links minimum useful evidence and never copies credentials, secrets, sensitive payloads, or detailed source truth.

## Projection And Recovery

No proposed Map, Feature, Leg, or Work Item semantics are durably published before exact Map acceptance. The narrow Publisher may create only a minimum Map identity shell saying `no accepted candidate` when required to host the Decision. After Decision recording it projects identities and children in two passes, resolves all locators/edges, refreshes Feature then Map bodies, and rereads rendered history/state.

A partial publication names the Decision, successful locators, failed operation, incomplete/pending records, and safe resume. Resume reuses durable bindings and never reposts the Decision, deletes successes, rolls IDs back, or overwrites semantic conflicts. Current body/child content remains projection, never a second accepted plan.

No representation action authorizes implementation, credentials, external effects, PR creation/landing, merge, deployment, spending, or resource creation.
