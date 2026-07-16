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
- Start visual preparation from the shaped visual anchor and traced reader-facing assertions. Formatting chooses only the target realization of the selected semantic form; it does not redefine the reader question, placement, takeaway, decomposition, semantic scope, or form. If target constraints require another form, return the anchor to `document-shape`.
- Inspect available skills, tools, and capabilities. Use semantic HTML, Mermaid, SVG, or another deterministic route when it faithfully realizes the selected form. Use generated images only when the selected form requires spatial or illustrative treatment unavailable through deterministic routes. If no route preserves the anchor legibly at target size, return it to `document-shape`.
- Preserve critical decisions, risks, caveats, review asks, and searchable conclusions outside hidden-only structures.
- Ensure target output preserves reading order and meaning across expected viewport and accessibility constraints.
- Derive evidence backlinks from trace and source metadata rather than creating a second provenance system.
- Record local presentation evidence for every target: asset and link resolution, normal and narrow layout inspection, navigation, text alternatives, searchable critical meaning, and semantic comparison with the traced source.
- Keep formatted outputs, generated assets, prompts, screenshots, and presentation evidence inside the document session under the approved Case workspace unless the author explicitly selects a tracked destination.
- If a target cannot preserve a traced unit, retain a readable textual equivalent and report the target limitation instead of silently omitting or changing the unit.
- Route unsupported visual meaning to `document-reconcile`; route an over-scoped or narratively misplaced visual to `document-shape`.
- For every retained meaning-bearing visual, load `resources/visuals/visual-validation.md`. Load `semantic-diagram-spec.md` only for a diagram and `generated-image.md` only for image generation.
- Complete formatting only when the selected adapter requirements, asset and link checks, local presentation evidence, and applicable visual validation are complete, or when a required remote-preview limitation is recorded.

## Boundary

- Do not publish externally.
- Do not waive trace blockers, stale support, unsupported assertions, or authority conflicts.
- Do not hard-code a specific database placement, workspace, company, or personal path.
- Do not generate visuals that imply unsupported relationships.

## Progressive Resources

Initial target and visual skeletons live under `resources/adapters/` and `resources/visuals/`.
