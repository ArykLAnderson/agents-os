# Visual Validation

Validate a semantic visual against its shaped visual anchor and traced source before treating it as presentation evidence. Contextual comprehension belongs to `document-review`.

- Name the trace units and source entries represented by the visual.
- Confirm that the realization preserves the anchor's selected form, reader question, takeaway, omissions, and forbidden implications.
- Check that every displayed relationship is supported and that no spatial grouping, arrow, color, ordering, or label implies unsupported authority, causation, chronology, or completeness.
- Check cognitive load at intended display size. Remove internal IDs, exhaustive operation inventories, edge labels, and validation detail unless the visual anchor makes them reader-relevant.
- Provide an adjacent text equivalent that preserves the visual's reader-relevant meaning.
- Check the source asset exists, its reference resolves, and its caption or alternative text identifies its limits.
- For a generated image, check its provenance record against the semantic spec, confirm the target embeds the approved asset, and inspect image-specific illegibility or unsupported implications introduced by composition or style.
- If support fails, retain the text artifact, block the visual, and route the issue to `document-reconcile`. If comprehension, placement, scope, or cognitive budget fails, return it to `document-shape`; do not use the caption or text equivalent to rescue a misleading visual. Formatting may use a simpler route only when the shaped anchor remains unchanged.
