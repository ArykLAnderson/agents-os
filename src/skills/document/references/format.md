# Format

Create target representations from the authoritative semantic draft without changing meaning.

- **Portable Markdown:** use standard headings, lists, tables, links, fenced code, and local relative assets. Avoid destination-specific syntax unless isolated with a fallback.
- **HTML companion:** produce a self-contained, responsive reading experience proportionate to the artifact boundary. For a private single-reader review artifact, preserve clear semantic heading order, selectable text, link integrity, concise captions or nearby explanations for meaningful visuals, and comfortable desktop/phone reading; do not require bespoke ARIA, accessibility audits, print/PDF behavior, zoom matrices, or multi-browser testing unless requested or materially required by the audience/distribution boundary.
- **Notion native:** translate into native blocks, tables, callouts, toggles, links, and attachments supported by the destination. Do not treat raw Markdown or an HTML embed as equivalent to a native representation.

For semantic diagrams, define nodes, edges, grouping, direction, labels, and source-backed emphasis before rendering. Validate syntax and inspect the rendered result against the visual anchor's takeaway, must-show meaning, omissions, and forbidden implications; return misleading visuals to Shape rather than rescuing them with captions. Generated images are optional; use them only when deterministic diagrams cannot express the needed idea, the provider and data class are acceptable, and factual content has a text fallback. Retain local provenance: visual-anchor ID, traced semantic units, capability/provider, prompt-equivalent instructions, asset ID, generation date, and material edits. Never retain credentials or unnecessarily sensitive prompt material.

Inspect each representation proportionately at its intended reading widths and medium. A private review HTML defaults to one ordinary desktop width and one phone width, checking comfortable reading, obvious clipping, unreadable labels, broken links, missing assets, accidental meaning changes, and unsupported visual implications. Expand the inspection matrix only when the requested representation, audience, or publication boundary requires it.

Formatting completes when the target faithfully represents the accepted semantic draft and passes target-specific inspection.
