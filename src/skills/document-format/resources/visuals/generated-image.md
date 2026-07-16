# Generated Image

Use this workflow only when a retained visual anchor and validated diagram specification select an image-based realization. It is capability- and provider-neutral.

## Select A Rendering Route

1. Inspect the current environment's available skills, tools, and capabilities before selecting a route. Record whether a usable image-generation capability is available; do not infer availability from this resource.
2. Require a shaped visual anchor and completed `semantic-diagram-spec.md` before rendering a semantic diagram. The anchor bounds the reader question and cognitive budget; the spec bounds the image. Generation must not invent content, relationships, labels, or visual implications.
3. Use image generation only when the shaped anchor requires spatial or illustrative treatment that deterministic routes cannot communicate well. Complexity alone is not a reason to generate an image; a dense node or edge count is first a signal to return to shaping and split, distribute, simplify, convert, or remove the visual.
4. Prefer Mermaid, SVG, or semantic HTML for simple diagrams with few nodes and relationships, or when deterministic labels, exact geometry, editability, inspectability, and revision control outweigh presentation fidelity.
5. Do not feed an over-dense spec to image generation. Return it to shaping when one image cannot preserve the takeaway legibly at the intended size.
6. If image generation is unavailable, unsuitable, fails validation, or cannot be regenerated within the formatting task, do not block the document. First simplify or split the visual; then use the best supported deterministic or textual fallback and disclose the route, limitation, and reason in local presentation evidence.

## Generate And Record

1. Derive the generation prompt from the validated semantic spec. Include its purpose, reader question, allowed assertions, required elements and labels, forbidden implications, visual style constraints, accessibility requirement, and target dimensions or format. Explicitly exclude unsupported detail.
2. Preserve a provenance record beside the artifact or its visual asset. Record the semantic spec and trace references, capability selected, prompt or prompt-equivalent instructions, generation date, output identifier or source location when available, source asset path, target, and any manual edits or transformations. Do not record secrets or credentials.
3. Store the generated output in the artifact's assets location with a stable, descriptive name. Retain the source or editable asset when the capability provides one and target policy permits it.
4. Bind the output to the visual trace units in the semantic spec. Provide concise alt text and an adjacent textual equivalent that preserves every critical reader-relevant relationship, decision, risk, caveat, and conclusion. The document must remain understandable if the image does not load or is inaccessible.
5. Embed the approved asset in the selected target using the target adapter's supported image mechanism. Keep the caption, visible boundary or caveat, and textual equivalent in the same readable section; do not put critical meaning only in the image, alt text, or hidden metadata.

## Validate, Regenerate, Or Fall Back

1. Validate against `visual-validation.md` and the semantic spec: inspect required labels and relationships, forbidden implications introduced by composition, color, grouping, position, or style, asset and link resolution, target embedding, desktop and narrow rendering, caption, alt text, and adjacent text equivalent.
2. If the image adds unsupported meaning, is illegible, omits required meaning, violates the target's constraints, or has an inaccessible critical detail, revise the prompt or rendering instructions from the semantic spec and regenerate. Update the provenance record for each material attempt and final selection.
3. If regeneration cannot produce a valid image, mark the image blocked, retain the validated text equivalent, use Mermaid, SVG, semantic HTML, or text as appropriate, and record the fallback and limitation in presentation evidence. Route any semantic conflict to `document-reconcile`.
