# Case Contract

One Case is one complete logical aggregate committed through the packaged Casebook CLI. Its immutable stable ID defines identity.

A complete Case aggregate includes:

- its stable ID, title, summary, scope, provenance, aliases, facets, relationships, and references;
- Knowledge entries with stable IDs and display labels such as `CK-001`, classification, purpose, support, conditional authority, examination objective, scope, relationships, and substantive content; and
- Sources with stable IDs and display labels such as `SRC-001`, locators, examination objective, scope, and evidence fragments.

`title`, `summary`, Scope, and Knowledge are mandatory semantic content. Sources are mandatory for knowledge claiming source support; a simple direct-created provisional entry may begin with no Source and therefore makes no source-supported claim until later reconciliation. Assemble and submit the complete aggregate through the CLI; it is not a direct-file interface. Every family has a stable typed ID; preserve old titles as typed aliases when useful, private visibility unless explicitly authorized otherwise, and every unchanged family during reconciliation.

The CLI may enforce stricter normalized fields than this semantic outline. For creation, concise direct flags or compact stdin JSON with valueless `--draft` may expand only the documented mechanical defaults; a complete aggregate remains valid. For reconciliation, read the current aggregate with `casebook read case` and validate it here before full-aggregate commit. For creation, validate the new candidate aggregate or supported compact/direct authoring input without attempting to read a nonexistent Case, then use `casebook create case` as specified by the persistence procedure. Never reconstruct an update from a partial excerpt or use creation shortcuts for reconciliation.

## Knowledge Integrity

Split entries when support, authority, classification, scope, contestability, or supersession differs. Every reconciled entry needs an ID, title, classification, purpose, support, examination objective, and substantive content. For direct-created provisional knowledge, the absence of Sources means unsupported until reconciliation.

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
