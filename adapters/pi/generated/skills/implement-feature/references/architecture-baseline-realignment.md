# Architecture Baseline Realignment

Use this gate when review, integration, remediation, or `zoom-out` reveals that the accepted solution changes an architectural assumption frozen at feature start.

## Trigger

Baseline realignment is mandatory when an accepted correction changes any of:

- canonical spec, ADR, domain meaning, or public behavior
- shared module, caller, ownership, authority, trust, mutation, persistence, deployment, or HITL boundary
- a contract inherited by another ticket
- ticket decomposition, dependency ordering, HITL boundary, or acceptance responsibility
- an assumption used by already-dispatched, implemented, reviewed, or integrated downstream work

A same-seam implementation omission that preserves every frozen and inherited contract does not trigger this gate.

## Human authority

Enter `NEEDS ATTENTION — BASELINE REALIGNMENT` and stop the affected dependency chain. A coordinator, reviewer, writer, or reviewer consensus may recommend the change but may not authorize it.

The human who owns feature intent must explicitly approve the revised architectural highlights and their downstream implications. Previous broad implementation authority, silence, green tests, an accepted review finding, or approval of the immediate correction alone is not approval of inferred changes to downstream tickets.

Keep the approval discussion compact and decision-oriented unless the human asks for detail. Present one core recommendation at a time when clarification is needed. Distinguish required contract preservation from optional hardening or review-driven overreach.

## Freeze before analysis

Before proposing the revision:

1. Fence active writers for the affected ticket and every transitive dependent.
2. Freeze candidate SHAs, exact commit/review lineage, current graph fingerprint, and active baseline revision.
3. Do not initiate or advance implementation/closure review, remediate, integrate, dispatch dependents, edit canonical requirements, or mutate tracker scope while the proposal is unresolved. Read-only inspection and advisory analysis needed to prepare the decision packet remain allowed.
4. Independent work may continue only when it cannot consume or prejudice the changed contract.

## Cascade analysis

Compare the proposed correction against the frozen baseline and every affected current or downstream ticket. Record a decision-ready impact matrix:

| Field | Required content |
| --- | --- |
| Source decision | Review/zoom-out finding and why the old assumption failed |
| Old assumption | Frozen spec/ADR/ticket/graph contract |
| Revised contract | Recommended architectural invariant or seam |
| Affected work | Current and transitive downstream tickets, integrations, docs, tests, and HITL gates |
| Disposition | `unchanged`, `amend`, `split`, `new-predecessor`, `defer`, `supersede`, or `corrective-ticket` |
| Candidate handling | `retain`, `selective-rework`, or `discard`, with rationale |
| Evidence impact | Tests/reviews/SHAs invalidated or still applicable |
| Risks and exclusions | Required safety versus optional complexity/overreach |

Specifically inspect whether the correction must:

- amend downstream acceptance criteria or inherited inputs
- split an oversized ticket or move responsibility to its correct owner
- add a blocking predecessor or change dependency edges
- change an AFK/HITL boundary
- invalidate an active assignment, candidate, review, integration, or verification result
- normalize a cross-ticket representation or compatibility contract
- create a corrective ticket rather than rewriting already-integrated history

Do not claim “no material drift” until this cascade analysis is complete.

## Human decision packet

Present the human with:

1. the problem in plain language
2. the recommended revised invariant
3. the key trade-off
4. affected tickets and proposed graph shape
5. what remains unchanged
6. candidate salvage recommendation
7. explicit deferrals and HITL boundaries

Ask for explicit confirmation, modification, or rejection. Preserve unresolved tensions. Do not create a final spec, mutate tracker contracts, or resume code merely because the proposal seems obvious.

## Reproducible baseline manifest and fingerprint

Before requesting approval, prepare the exact proposed revised input snapshots and a `baseline-manifest-v1.json`. The manifest uses UTF-8 JSON Canonicalization Scheme (RFC 8785) and contains:

- `schemaVersion: "agent-os-baseline-manifest-v1"`
- stable feature ID and proposed revision ID
- predecessor baseline fingerprint, or `null` for the initial revision
- canonical feature/spec/ADR/glossary sources as sorted `{id, source, revision, sha256}` entries
- immutable ticket snapshots as sorted `{id, source, revision, sha256}` entries
- dependency edges as lexicographically sorted `[predecessor, successor]` pairs
- explicit HITL gates and feature-wide constraints as sorted entries
- proposal and cascade artifact SHA-256 digests

Reject duplicate IDs/edges, unresolved mutable references, absent content digests, or non-canonical ordering. Compute:

```text
graphFingerprint = "sha256:" + SHA256(RFC8785(baseline-manifest-v1.json))
```

The stored manifest bytes are the proof input. Never recompute a fingerprint from live mutable tracker state without first capturing immutable content snapshots.

## Approval binding

The human approves an exact candidate revision, not a floating recommendation. Preserve an immutable approval record containing:

- approver identity and authority
- UTC timestamp and durable decision source/link
- decision: `approved`, `modified`, or `rejected`
- proposal digest and cascade digest
- candidate manifest digest and graph fingerprint
- approved architectural highlights, downstream ticket/DAG consequences, exclusions, and unresolved tensions

If any approved proposal, cascade, ticket snapshot, edge, constraint, or manifest byte changes, the approval does not apply; regenerate the candidate fingerprint and return for explicit human approval. Do not activate a revision whose approval record does not match its exact manifest fingerprint.

## Publish an approved baseline revision

After explicit approval, publish one coherent revision before implementation resumes:

1. Preserve the immutable original snapshots and prior graph fingerprint.
2. Update canonical specification, ADRs, glossary, and architecture documents as applicable.
3. Amend, split, supersede, or create tracker tickets and dependencies according to the approved cascade.
4. Capture immutable snapshots of the revised inputs and verify their content digests match the exact human-approved `baseline-manifest-v1.json`; record its revision ID, predecessor fingerprint, manifest digest, graph fingerprint, and bound approval evidence.
5. Update `graph.md`, `drift.md`, ticket state, and tracker-visible status.
6. Mark stale assignments, candidates, reviews, integrations, and verification evidence invalid or reference-only.
7. Give every new assignment the approved baseline revision and graph fingerprint.

Treat publication as atomic at the workflow level: keep the affected chain blocked until every canonical document, tracker contract, dependency edge, snapshot, and fingerprint agrees. Partial remote updates do not authorize implementation.

## Resume and salvage

Resume from the earliest affected graph node only after publication reconciliation succeeds.

For existing work:

- never patch a candidate indefinitely merely because code already exists
- selectively reuse code only when it satisfies the revised ticket contract
- do not rewrite accepted integration history; prefer an explicit corrective predecessor/ticket
- rerun review and verification invalidated by the revised contract
- preserve all superseded artifacts as provenance, not authority

A `zoom-out` recovery-attempt budget begins only after the approved baseline revision is published. Baseline deliberation and publication do not consume solve attempts. Any new architecture movement during a solve attempt returns to this HITL gate rather than being absorbed into attempt 2.
