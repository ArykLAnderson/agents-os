---
name: image-generation
description: Use when the user or another skill needs an optional visual for an illustration, atmospheric or conceptual image, visual variant, or image-form recommendation, including visual materialization in Document, Blueprint, Frontend Design, research, reporting, or content work. Keep generated imagery out of factual evidence and exact semantic diagrams.
user-invocable: false
argument-hint: <visual need, audience, and any permitted references>
---

# Image Generation

Provide an optional visual-delegation capability for Document, Blueprint, Frontend Design, research/reporting, and future content skills. The result may be a generated asset, an existing approved asset recommendation, a deterministic visual recommendation, or no visual. A request for a visual never creates a quota to generate one.

This capability owns visual-form recommendation, a provider-neutral brief, minimized permitted inputs, bounded candidate critique, truthful provenance and limitations, and stop/refusal behavior. The caller retains its artifact's argument, layout, factual accuracy, accessibility, and final acceptance.

## Select the Visual Form First

Classify the requested role as **factual/semantic**, **decorative/expressive**, or **mixed** before generating.

- Prefer approved existing assets or screenshots when they are the truthful source; tables/charts for quantitative evidence; and Mermaid, inline SVG, or HTML/CSS for exact labels, topology, sequence, state, maps, UI, or relationships.
- Generated imagery is appropriate for an illustrative, atmospheric, conceptual, or otherwise non-deterministic role when the provider and data boundary permit it.
- Generated imagery is never factual evidence. Keep factual meaning in a source-bounded deterministic layer or text fallback. Do not let decorative output imply unsupported facts.
- For a mixed visual, preserve factual meaning outside the generative layer and state the limit clearly.
- Recommend no visual when prose communicates the point just as well.

For an exact or code-authored visual, return the deterministic recommendation and its semantic brief rather than forcing generation. Its later implementation still requires rendered-image inspection.

## Establish the Delegation Boundary

Build the provider-neutral brief in [references/delegation.md](references/delegation.md). It describes the role and constraints, not provider prompt syntax. Infer a missing detail only when the inference is low-consequence and reversible. Ask one bounded question when missing context could materially change meaning, privacy, rights, spend, or consequential taste.

Before any external generation, establish:

- **Authority:** caller-supplied purpose, audience/distribution, authoritative facts, permitted disclosure class, usage, and budget ceiling or no-spend boundary. Paid generation, material spend, external publication, policy/privacy exceptions, consequential likeness, and unsettled rights or taste require human authority; do not spend, publish, or decide them.
- **References:** distinguish factual source, inspiration, style-continuity, and identity/likeness references. Possession does not establish consent, rights, ownership, or clearance. Use each only for its declared purpose and permitted provider/data class.
- **Privacy:** minimize the input. Never send private or sensitive project context to an external provider without compatible disclosure authority. Never retain credentials or unnecessary sensitive prompt material.
- **Continuity:** carry a compact approved style direction and permitted representative references or prior accepted outputs through this bounded request. Report drift or incompatibility. Do not create a brand system, approve a new style, or manage an asset estate.

## Discover Capability and Realize Safely

Inspect the active harness's available image-generation or image-rendering capabilities and their instructions before selecting a route. Use an available, permitted capability; preserve provider-specific mechanics inside that route. Do not invent provider availability, model identity, metadata, local rendering, or a fallback capability.

If no suitable capability is available, or the data/provider boundary is not authorized, return the truthful non-generation result from [references/delegation.md](references/delegation.md). Offer the best known approved-asset, deterministic, redacted/local, or no-visual alternative without claiming it exists or was performed.

When generation is permitted:

1. Create a candidate from the provider-neutral brief, with explicit role, composition-safe areas, constraints, and forbidden implications.
2. Treat it as a candidate, never presumed satisfactory. Inspect the actual rendered visual at a representative intended size using visual capability.
3. Check role fit, must-show and must-not-imply meaning, composition, readability of unavoidable visible text, obvious defects, crop/scaling, and gross style mismatch.
4. Repeat a focused pass only while a named, correctable material deficiency is improving and value, authority, and provider/spend limits remain. On each pass, name the deficiency, change one concern at a time where practical, and create variants only for a named choice or explicit caller request.
5. Stop on verified role satisfaction, non-improvement, diminishing decision value, missing taste authority, or provider/spend limits. Return the best usable outcome and its remaining limitation; the loop has no fixed pass cap but must never continue indefinitely.

Every visual returned as satisfactory must have been visually inspected in its rendered form. For SVG or another code-authored visual, render it into a viewable image and view that image with visual capability. Reading XML/source, parsing, linting, or successful rendering alone is not visual inspection. Pay particular attention to clipping, overlap, broken layout, unreadable labels, viewBox/cropping, scaling, and whether the rendered relationships convey the intended semantics.

## Return a Usable Result

Return the proportionate package in [references/delegation.md](references/delegation.md): generation status; asset path or locator when present; format and pixel dimensions when observable; concise placement/usage guidance; limitations; unresolved issues; and the chosen visual form. For a downstream artifact requiring traceability, include safe local provenance: prompt-equivalent instructions, capability/provider and model identity when observable, asset/provider identity when observable, generation date, safe reference/source locators, and material edits. Mark unavailable metadata `unknown`; never invent it.

Default private founder-review QA is basic: opening/renderability, format/dimensions, obvious artifacts, legibility of unavoidable visible text, role fit, must-show/must-not-imply meaning, and gross style mismatch. Accessibility, print/color management, browser/device matrices, publication QA, exhaustive rights review, and broad audience testing apply only when the audience/distribution requires them or the caller explicitly requests them.

## Refuse and Degrade Truthfully

Do not fabricate an asset, inspection, provider result, rights clearance, consent, legal conclusion, or factual reconstruction.

- For unavailable tools or providers, return the attempted role, safe failure evidence, and the best available non-generation fallback.
- For unsafe/disallowed input, refuse at a useful level without retaining unnecessary sensitive material; offer a safe reframing if possible.
- For sensitive context lacking disclosure authority, do not send it externally. Ask one bounded authority question or offer a redacted, local, deterministic, or no-visual route only if actually available.
- For insufficient identity or style reference, do not promise likeness or continuity; request the minimum missing permission/reference when material, or offer a deliberately non-identifying alternative.
- For unverifiable factual imagery, redirect to deterministic form or use clearly illustrative output with text fallback and explicit limits.
- For a technically successful but role-failing candidate, use the bounded corrective loop. If it does not improve or authority ends, return the best explicitly limited asset or a non-generation result; never silently lower the requested role.
- For unresolved copyright, style, or policy risk, respect provider policy and route consequential rights/taste decisions to the human. Do not assert legality, ownership, or clearance.

Do not add a universal creative pipeline, mandatory variants, DAM, campaign bureaucracy, provider-abstraction promise, model benchmark, or production QA regime to satisfy this skill.
