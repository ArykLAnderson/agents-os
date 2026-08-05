# Format

Create semantic target representations and realization handoffs from the authoritative draft without changing meaning.

- **Portable Markdown:** use standard headings, lists, tables, links, fenced code, and local relative assets. Avoid destination-specific syntax unless isolated with a fallback.
- **Structured content handoff:** state the intended hierarchy, reader journey, content accessibility requirements, meaningful emphasis, interaction semantics, and target-medium constraints that Presentation must preserve.
- **Notion native:** specify or translate native blocks, tables, callouts, toggles, links, and attachments supported by the destination. Do not treat raw Markdown or an HTML embed as equivalent to a native representation.

For semantic diagrams, define nodes, edges, grouping, direction, labels, source-backed emphasis, text fallback, material omissions, and forbidden implications before realization. This is a meaning-bearing specification, not a finished visual. Presentation chooses the visual medium and realizes it without changing those semantics. Do not select an imagery provider or generate a finished asset as part of Document formatting. If Presentation proposes generated imagery, its text fallback, acceptable provider and data class, local provenance, and inspection remain Presentation responsibilities; never retain credentials or unnecessarily sensitive prompt material.

Document verifies semantic order, text equivalents, claim fidelity, and handoff completeness. Presentation inspects the realized medium, responsive behavior, rendered accessibility, and visual implications using [its inspection guide](../../presentation/references/inspection.md). Do not claim rendered readiness from a Document format check.

Formatting completes when the semantic target or handoff faithfully represents the accepted draft and is ready for the separately owned Presentation realization when one is requested.
