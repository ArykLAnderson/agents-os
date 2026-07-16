# Visual Validation

Validate a semantic visual against the traced source before treating it as presentation evidence.

- Name the trace units and source entries represented by the visual.
- Check that every displayed relationship is supported and that no spatial grouping, arrow, color, ordering, or label implies unsupported authority, causation, chronology, or completeness.
- Provide an adjacent text equivalent that preserves the visual's reader-relevant meaning.
- Check the source asset exists, its reference resolves, and its caption or alternative text identifies its limits.
- For a generated image, check its provenance record against the semantic spec, confirm the target embeds the approved asset, and inspect image-specific illegibility or unsupported implications introduced by composition or style.
- If a visual check fails, retain the text artifact, mark the visual blocked, use the best supported Mermaid, SVG, semantic HTML, or textual fallback, disclose the fallback and limitation in presentation evidence, and route the semantic issue to `case-reconcile`.
