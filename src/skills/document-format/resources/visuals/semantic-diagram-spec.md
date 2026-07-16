# Semantic Diagram Spec

Describe every semantic diagram before rendering it. The spec is the visual's trace contract, not a design wish list.

## Required Fields

- **Purpose and reader question:** the one question the visual answers.
- **Support:** trace units and fully qualified entries from the artifact's pinned Case snapshots, or named direct sources when the artifact legitimately relies on direct sources. If material visual meaning lacks that support, stop and return it to `document` for source recovery or reconciliation; do not substitute working notes or local files as authority.
- **Allowed assertions:** relationships the visual may express.
- **Forbidden implications:** unsupported approval, causality, chronology, completeness, precision, priority, or production status the layout must not suggest.
- **Elements:** required nodes, labels, edges, status labels, caption, and visible boundary or caveat.
- **Trace:** artifact anchor plus visual trace unit(s), including each material edge or comparison.
- **Accessibility:** concise alt text and adjacent textual equivalent that preserves the reader-relevant relationship.
- **Validation:** source/trace check, label and edge inspection, link or asset resolution, desktop and narrow rendering review, and the recorded limitation. For a generated image, also name the selected capability or fallback route and its provenance record.
- **Complexity:** classify the visual as `simple` or `complex`. Treat multi-lane flows, return loops, nested boundaries, many directional edges, and status-dependent paths as complex. Record whether the spec should be split before rendering.

## Design Rules

Do not use position, arrow direction, color, or grouping as decoration when it adds semantic meaning. Use neutral grouping for a collection, explicit labels for status, and separate lanes for evidence and authority when both appear. A diagram may simplify only if its caption and text equivalent preserve the omitted boundary.

Use deterministic HTML, SVG, or Mermaid only while the connector and layout model remains visually reliable. For complex diagrams, prefer validated generated images when capability exists. The semantic spec and textual equivalent remain authoritative regardless of rendering route.
