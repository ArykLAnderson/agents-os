# Case Contract

One Case is one complete logical aggregate selected under one persistence authority. Its immutable stable ID defines identity. Under file-authoritative Markdown, the selected connector materializes that aggregate as an independently readable `.casebook/cases/<case-id>.md` dossier and performs complete atomic replacement; this path is not a direct-write interface.

```markdown
---
type: case
schema_version: 1
id: case:<collision-resistant-local-id>
title: <mutable title>
summary: <one-sentence conceptual boundary>
relationships:
  <directional-key>:
    - case:<id>
---

## Scope
<included subject, authority context, and material exclusions>

## Knowledge

### CK-001: <title>
- Classification: accepted | provisional | contested | superseded
- Purpose: <why this is reusable>
- Support: <SRC references with pinpoint locators, authority, inference, or unsupported>
- Authority: <conditionally required person or role, decision/source reference, and applicability>
- Examined for: <knowledge objective of the intake or reconciliation batch>
- Scope: <when materially narrower than the Case>
- Relationships: <optional directional key-to-target collections>

<one independently classifiable semantic unit>

## Sources

### SRC-001: <source title>
- Locator: <stable URI, path plus revision, page, or artifact reference>
- Examined for: <short objective summary>
- Scope: <material qualification or exclusion>
```

`title`, `summary`, Scope, Knowledge, and Sources are mandatory semantic content. The Markdown above is a readable authoring projection, not permission to write the authority file. Assemble the connector request as one complete typed Case aggregate: Case profile and provenance, aliases, facets, knowledge entries, sources and evidence fragments, relationships, and references. Every family has a stable typed ID; keep `CK-001` and `SRC-001` as human-readable display labels. Preserve old titles as typed aliases when useful, private visibility unless explicitly authorized otherwise, and every unchanged family during reconciliation.

The selected connector controls physical rendering and may include stricter normalized fields than this semantic projection. Read the current aggregate through `case.read`, validate it here, then use `case.create` or `case.commit_revision` as specified by the persistence procedure. Never reconstruct an update from a partial Markdown excerpt.

## Knowledge Integrity

Split entries when support, authority, classification, scope, contestability, or supersession differs. Every entry needs an ID, title, classification, purpose, support, examination objective, and substantive content.

- `accepted`: support establishes the current meaning; applicable authority is also required when the meaning depends on a decision, policy, approval, ownership, or delegated judgment.
- `provisional`: useful current meaning remains qualified by uncertainty.
- `contested`: preserve each position and its support separately.
- `superseded`: preserve original support and identify the successor and supersession basis.

Unsupported knowledge says `unsupported`. Human-authorized knowledge uses a separate `Authority` field and preserves evidence of that authority's applicability. Accepted decisions, policies, approvals, and delegated judgments identify the decision owner and cite the recorded decision or confirmation by that owner; a participant statement without established authority remains provisional or contested. Distinguish inference from direct source support. Do not use classification to encode freshness, historical scope, rejection, or canonicality.

For a contested entry, use at least two position blocks, each with substantive content and its own Support plus conditional Scope, Authority, and Inference fields:

```markdown
#### Position: <title>
- Support: <pinpoint support or unsupported>
- Authority: <when applicable>

<position content>
```

Sources use Case-scoped IDs. Cite entries with pinpoint locators: heading, file and line range plus revision, page or block, timestamp, query/result ID, or a visibly marked short quotation. Use whole-source support only for short or uniformly supportive sources. Cross-Case references use `case:<id>#CK-001` and `case:<id>#SRC-001`.

Relationships are directional key-to-target collections owned by the declaring Case or entry. Use stable IDs or URIs as targets. Compact values contain only the target; expanded values may add scope or explanation. Targets may be Cases, entries, sources, retained artifacts, or external URIs. Backlinks are derived. Citations establish epistemic support; relationships establish topology.

Readable research, prototype, deliberation, review, or modeling artifacts belong at `.casebook/artifacts/<artifact-id>/artifact.md` when reducing them to entries would lose important argument, method, context, or reproducibility. Artifact frontmatter requires `type: artifact`, `schema_version: 1`, `id: artifact:<globally-collision-resistant-id>`, `title`, and `summary`. Reference them as `artifact:<id>`; validation resolves that ID through the canonical entry point.
