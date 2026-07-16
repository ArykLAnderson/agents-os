---
name: document-format
description: Create an inspected target representation from document substance without changing meaning. Use for Notion-native, portable Markdown, HTML, and visual target preparation.
user-invocable: true
argument-hint: "[shaped artifact] [target format]"
---

# Document Format

Express a shaped, traced artifact in a selected target format.

Formatting translates structure, disclosure, visuals, navigation, links, and accessibility affordances. It does not change established meaning, priority, authority, or reader action.

## Operation Contract

- **Inputs:** semantic or shaped artifact, target adapter, relevant trace when required by risk or adapter, and available rendering capabilities.
- **Outputs:** target representation, visual-route decision where useful, and local presentation evidence or a stated remote-preview need.
- **Quality purpose:** provide the best faithful representation for the intended destination while preserving semantic authorship boundaries.
- **Return:** report work performed; changed Cases or artifacts; conditions satisfied or made stale; blocking and disclosable findings; and recommended next operations. Return control to `document` when target constraints require semantic revision, staged remote review, or an authorial visual choice.

Load `../document/resources/operation-result.md` before returning a result.

- Load only the selected target adapter from `resources/adapters/`.
- Start from a shaped artifact and its selected-entry or source metadata. Use its trace sidecar when tracing is applicable; do not require trace work for a low-risk artifact that the coordinator has selected not to trace. Keep the formatted artifact beside any trace and preserve the source revision and snapshot identity.
- Use visual resources from `resources/visuals/` only when the artifact requires visual companion work.
- During visual preparation, inspect available skills, tools, and capabilities; never assume image generation is installed. Start every semantic visual from `semantic-diagram-spec.md`. Choose prose or tables when a visual adds no comprehension. Use Mermaid, SVG, or semantic HTML for simple diagrams where deterministic labels, a small number of relationships, editability, or accessibility matter most. For complex flow, lifecycle, architecture, or multi-lane diagrams, prefer a validated image-generation capability when available: browser-rendered HTML/SVG connectors frequently produce awkward routing and visual artifacts at that complexity. Keep the semantic spec as source of truth, validate the generated image against it, and retain an adjacent textual equivalent. If image generation is unavailable or cannot produce a faithful result, simplify or split the visual before falling back to deterministic rendering. Disclose the chosen route and fallback in presentation evidence.
- Preserve critical decisions, risks, caveats, review asks, and searchable conclusions outside hidden-only structures.
- Ensure target output preserves reading order and meaning across expected viewport and accessibility constraints.
- Derive evidence backlinks from trace and source metadata rather than creating a second provenance system.
- Record local presentation evidence for every target: asset and link resolution, normal and narrow layout inspection, navigation, text alternatives, searchable critical meaning, and semantic comparison with the traced source.
- Keep formatted outputs, generated assets, prompts, screenshots, and presentation evidence inside the document session under the approved Case workspace unless the author explicitly selects a tracked destination.
- If a target cannot preserve a traced unit, retain a readable textual equivalent and report the target limitation instead of silently omitting or changing the unit.
- Route semantic changes or unsupported visual implications to `document-reconcile`.

## Boundary

- Do not publish externally.
- Do not waive trace blockers, stale support, unsupported assertions, or authority conflicts.
- Do not hard-code a specific database placement, workspace, company, or personal path.
- Do not generate visuals that imply unsupported relationships.

## Progressive Resources

Initial target and visual skeletons live under `resources/adapters/` and `resources/visuals/`.
