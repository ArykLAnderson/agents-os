# Semantic Diagram Spec

Translate a retained visual anchor into a diagram specification only when shaping selected a diagram as the explanatory form. The anchor owns narrative purpose and scope; this specification owns rendering requirements.

## Required Fields

- **Visual anchor:** the shaped anchor and its placement, reader question, takeaway, cognitive budget, and omissions.
- **Support:** trace units and fully qualified entries from the artifact's pinned Case snapshots, or named direct sources when the artifact legitimately relies on direct sources. If material visual meaning lacks that support, stop and return it to `document` for source recovery or reconciliation; do not substitute working notes or local files as authority.
- **Allowed assertions:** relationships the visual may express.
- **Forbidden implications:** unsupported approval, causality, chronology, completeness, precision, priority, or production status the layout must not suggest.
- **Elements:** the minimum nodes, labels, edges, status labels, caption, and visible boundary needed to deliver the anchor's takeaway.
- **Trace:** artifact anchor plus visual trace unit(s), including each material edge or comparison.
- **Accessibility:** concise alt text and adjacent textual equivalent that preserves the reader-relevant relationship.
- **Validation:** source/trace check, label and edge inspection, link or asset resolution, desktop and narrow rendering review, and the recorded limitation. For a generated image, also name the selected capability or fallback route and its provenance record.
- **Complexity:** classify rendering complexity as `simple` or `complex`. If the diagram now answers more than one reader question or needs an exhaustive node inventory to remain accurate, stop and return it to shaping for decomposition or conversion.

## Design Rules

Use position, arrow direction, color, and grouping only for meaning required by the visual anchor. Use neutral grouping for a collection, explicit labels for status, and separate lanes for evidence and authority when both are material to the same reader question. Keep omitted implementation detail in prose or internal trace rather than forcing it into the diagram.

Prefer deterministic semantic HTML, tables, cards, SVG, or Mermaid when exact hierarchy and responsive reflow matter. Use generated images only when spatial or illustrative treatment adds comprehension beyond those routes. The visual anchor, traced assertions, and textual equivalent remain authoritative regardless of rendering route.
