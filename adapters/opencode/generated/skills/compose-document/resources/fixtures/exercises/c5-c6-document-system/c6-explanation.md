# How A Case-Backed Document Stays Safe

- **Genre:** explanation document
- **Adapter:** `explanation-document.md`
- **Primary shaping strategy:** `mental-model`
- **Bounded secondary strategy:** `review-briefing`, used only in [Safe Publishing](#safe-publishing)
- **Reader:** a contributor who needs to understand how to create or review a local Case-backed document artifact
- **Reader action:** use the current safe artifact entrypoint, preserve its named snapshot and trace, and stop before an external write without authorization
- **Qualified inputs:** `notification-retry-policy/SNAP-005`; the source fixture's `INDEX.md`, `successor-r2` artifact and trace; local document-system skill instructions

## The Practical Problem

Documents are easy to make readable and easy to make unsafe. A readable brief can still present stale evidence as current, turn a source observation into policy, hide an omission, or make a diagram appear to prove more than its sources do.

The document system keeps those concerns distinct. It does not decide retry policy, approve a document, or publish anything by itself. In the representative retry-policy fixture, the safe current direction is not to state a retry count. `OBS-004` provides the current evidence boundary; `APR-004` approving `DEC-003` provides the separate no-count authority.

## Vocabulary

| Term | Meaning here | It is not |
|---|---|---|
| Source | A supplied record that can support an observation or claim. | Automatic policy authority. |
| Case | The working record of selected meaning, status, provenance, approvals, and snapshots. | A universal document model. |
| Snapshot | An immutable named Case entry set used by one artifact revision. | A moving pointer to the current Case. |
| Artifact | Reader-facing Markdown, HTML, or target representation. | Proof without its trace and inputs. |
| Trace | A sidecar that maps material artifact units and visuals to qualified support. | Reader-facing prose or an approval. |
| Review | A bounded inspection of fidelity, genre, readability, or presentation. | Stakeholder, policy, or publication approval. |
| Publish | An authorized external write plus read-back verification. | Formatting or a local HTML file. |

## Lifecycle

The lifecycle is a sequence of responsibilities, not a claim that every document requires every format or visual. A source bundle becomes a Case only after intake and approval. A snapshot pins the meaning used for composition. Composition selects entries for one genre; shaping makes a reader journey; tracing binds material claims to the snapshot; review evaluates the artifact; formatting creates local representations; publishing is separately gated.

```text
supplied sources -> Case working record -> immutable snapshot
                                      -> composition -> shaped artifact -> trace -> review -> local formats -> authorized publish
```

The retry-policy fixture demonstrates why the distinction matters. The frozen `baseline-r1` used `SNAP-003` and is stale. The normal entrypoint selects `successor-r2`, pinned to `SNAP-005`, with an open validation gap. A later Case correction does not rewrite the baseline or silently change the successor's pinned support.

## Skill Hierarchy

The skills are a handoff hierarchy, not one engine. `case-intake` and `case-reconcile` own accepted Case meaning. `compose-document` selects a genre-specific basis; `shape-document` creates a reader journey; `trace-artifact` binds the artifact to immutable support; `review-document` inspects it; `format-document` creates local representations; and `publish-document` alone owns external writes.

The hierarchy deliberately has stop points. Composition cannot invent a missing requirement. Shaping cannot make a new Case decision. Review cannot grant approval. Formatting cannot waive a stale trace. Publishing cannot guess a destination. If a new accepted meaning is needed, the path returns to `case-reconcile`, then a new snapshot and artifact revision.

## Trace

A trace is a sidecar for semantic units, not a line-by-line citation overlay. Each material recommendation, evidence synthesis, limitation, reader action, table row, or semantic visual has a stable artifact locator, a bounded assertion, a derivation type, and fully qualified support such as `notification-retry-policy/SNAP-005/DEC-003`.

For this fixture, the important claim is not merely that four retries failed delivery or five exceeded latency. The trace separates those observations from the accepted no-count direction. It also records the stale baseline and the omission of the duplicate unattributed claim so a reader cannot mistake omission for disappearance.

## Multi-Case Composition

Some documents need more than one Case snapshot. The correct model is a set of distinct lanes, not a merged super-Case. A composition manifest names every `<case-id>/<snapshot-id>/<entry-id>` reference and preserves which Case supplies each decision, observation, or gap. Cross-Case synthesis is allowed only when its joint support, scope, and uncertainty remain explicit.

For example, a change brief could use one Case for a retry-policy decision and another for a document-format limitation. The formatting Case would not gain policy authority, and the policy Case would not prove target rendering. The artifact must keep those claims separate in prose and trace accounting.

## Safe Publishing

Formatting produces a local representation; it does not make an external write safe. Before publication, an explicit authorization must identify the action, destination, actor, and artifact revision. The destination and permission must be verified. For an update, existing and child content must be read before a destructive change. Trace blockers, asset lifecycle, alternatives, and rendered output must pass. Only then can an external write occur, followed by a fetch and locator recording.

This exercise has none of those conditions. It records a no-write plan, makes no external tool call, guesses no workspace, creates no draft, and records no final locator. That is a successful safe stop, not a failed publication.

## Proof Coverage

Proof coverage asks a narrower question than “does the document look complete?”: for each reader-relevant claim, what supports it, where is the support bound, what was reviewed, and what remains unverified?

The representative fixture has source/Case evidence for the retry-policy boundary, local checks for artifact structure and presentation, and no evidence for external publication or real reader approval. Coverage is therefore uneven by design: it is strong for the local explanation's trace and presentation record, and explicitly absent for operational outcome. A report should show that difference rather than decorating an unverified claim as complete.

## Boundaries And Next Action

This explanation is a bounded teaching artifact. It does not establish a product requirement, a retry configuration, stakeholder comprehension, target accessibility conformance, or external publication permission. Its six diagrams are local semantic representations with adjacent textual equivalents and the individual limits stated in their specifications.

Use `artifacts/retry-policy-research-report/INDEX.md` to locate the safe current retry-policy artifact. For a new document, select one genre adapter, retain qualified snapshot inputs, record selection and omission, create a trace before relying on the artifact, and use the appropriate review or format stage. For an external write, stop until the publishing preconditions are explicitly met.
