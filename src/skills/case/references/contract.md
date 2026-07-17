# Case Contract

One Case is one Markdown file at `.casebook/cases/<case-id>.md`.

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

`title`, `summary`, Scope, Knowledge, and Sources are mandatory. The immutable ID defines identity; preserve old titles as aliases when useful.

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
