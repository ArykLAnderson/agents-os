# Document Session

Persist current artifact reality, not operation history or instructions.

```markdown
---
type: document
schema_version: 1
id: document:<collision-resistant-local-id>
status: active
---

## Intent
## Artifact Boundary
## Audience And Reader Action
## Pinned Cases
## Genre And Shape
## Semantic Basis
## Shaped Draft
## Knowledge Gaps
## Trace State
## Current Findings
## Representations
## Acceptance
## Publication State
```

Omit empty sections. Pin Case IDs, relevant entry states, and revisions or examination dates needed to detect staleness.

Statuses are descriptive: `active`, `completed`, `abandoned`, or `superseded`. Set `completed` only after the current revision satisfies its artifact boundary, required verification is current, and the human has accepted it. A material edit to a completed Document returns it to `active`. Publication remaining optional or separately authorized does not reopen a completed Document unless publication belongs to the requested artifact boundary.

`Artifact Boundary` records requested genre, required representations, and whether publication was requested. The semantic basis is pre-shaping material. Once a shaped draft exists, it is the sole authoritative semantic draft; trace, review, representations, acceptance, and publication name its revision. A material draft change invalidates affected downstream records.

The session owns editorial intent, the semantic draft, artifact-local findings, representations, and factual publication state. Cases own reusable subject meaning. Frames own broader uncertainty. Do not persist operation requests, callbacks, generic result logs, or recommended next actions.

Acceptance records `accepted revision`, `current safe revision`, and `validity: current | invalidated`, including the invalidating material change. Publication state records observed destination, authorization scope, remote revision, and verification, never commands to stage, retry, release, or roll back.
