# Evidence Synthesis Strategy

Use this strategy when the reader needs to inspect a conclusion against supporting, contradictory, and limited evidence. The reader must be able to distinguish observed results, accepted decisions, and recommendations without opening a source file.

## Reader Journey

Arrange the shaped document in this order unless the reader contract gives a stronger reason:

1. State the reader action and qualified recommendation.
2. State the decisive evidence and the resulting accepted direction separately.
3. Show the evidence table or grouped evidence, including contradictory findings and authority limits.
4. State material limitations, unresolved or deferred gaps, and scope boundaries.
5. End with the requested decision, follow-up, or no-action boundary.

Do not lead with raw chronology when it obscures the conclusion. Do preserve enough chronology to make supersession, historical claims, and contradiction handling understandable.

## Evidence Visibility

Use short stable semantic locators such as `## Recommendation`, `## Evidence`, `## Limitations`, and `## Decision Boundary`. A material table must identify what it establishes and what it does not establish. Keep internal Case IDs and fully qualified Case references in the trace sidecar or an internal evidence register. Use only audience-accessible citations or an explicit source limitation in reader-facing prose.

For each claim, expose its support class:

| Support class | Reader treatment |
|---|---|
| observed | State the result and its measured or source boundary. |
| accepted | State the decision and the approval boundary separately from evidence. |
| contradicted | Name the competing claim and why it is not the current direction. |
| limited | State the attribution, freshness, scope, or confidence limit next to the affected conclusion. |

## Compression Rules

Compress repeated source detail, not material distinctions. A rejected proposal can move to an evidence table when its visibility preserves the reader's understanding. An omitted selected entry must remain accounted for in the composition and trace sidecars. Never compress a caveat that would alter the apparent strength, authority, or applicability of the recommendation.

## No-Fit Signals

Do not use this strategy when the document is primarily a tutorial, a decision record with no evidence comparison, or a status update whose reader action does not depend on competing support. Stop and request a different selected strategy if the document cannot show its material contradictions and limitations without becoming misleading.

## Handoff

Return shaped Markdown with stable anchors, the retained pinned snapshot set, and an accounting of selected material omitted or deferred from reader-facing prose. Do not add Case meaning or perform tracing, review, formatting, publication, or reconciliation.
