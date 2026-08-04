# Visual Delegation and Return Package

Use this reference to make a visual request and result portable across callers and available providers. Keep it proportionate to the role; unknown fields remain `unknown`, not inferred as facts.

## Provider-Neutral Brief

Capture only the details needed to decide and realize the visual:

```text
purpose and visual role:
audience and distribution:
classification: factual/semantic | decorative/expressive | mixed
reader/user takeaway:
must show:
must not imply:
chosen form and why: existing | deterministic | generated | no visual
style direction and continuity context:
composition and safe/crop areas:
dimensions, aspect ratio, background, format, quality:
factual sources and required text fallback:
references: locator + role (factual | inspiration | style continuity | identity/likeness) + permitted use
input disclosure class and provider/data permission:
usage and placement:
budget/no-spend boundary:
```

Do not translate this into a provider prompt until a permitted capability has been discovered. Prompt-equivalent instructions may be retained only when safe; omit credentials and unnecessary private material.

## Return Package

Return one of these status values:

- `generated`: a visually inspected generated asset is available.
- `existing-recommended`: an approved existing asset is the truthful fit; no generated asset was made.
- `deterministic-recommended`: an exact semantic visual should be made in a deterministic form; describe the semantic brief and inspection requirement.
- `no-visual-recommended`: no visual materially improves the outcome.
- `unavailable`, `refused`, or `insufficient-reference`: no satisfactory asset was produced; explain the boundary and safe fallback.

For every status, return:

```text
status:
chosen form and reason:
asset path/locator (if any):
format and pixel dimensions (when observable):
inspection: rendered visual viewed at representative intended size | not applicable; findings
usage/placement guidance:
limitations and must-not-claim notes:
unresolved issue or authority needed:
```

When the caller needs traceability, add safe local provenance:

```text
prompt-equivalent instructions:
capability/provider and model identity (when observable):
generated asset/provider identity (when observable):
generation date:
source/reference locators safe to retain:
material edits and named deficiencies addressed:
```

For generated, SVG, or other rendered visual output, `inspection` must say what visual was actually viewed and summarize the result. Source review, syntax checks, or render-command success are not inspection.

## Basic Inspection Record

At minimum, evaluate the rendered visual against:

- declared role and reader takeaway;
- must-show meaning and must-not-imply constraints;
- composition, intended crop/scaling, and safe areas;
- obvious artifacts and gross style drift; and
- readable unavoidable visible text.

For SVG/code-authored visuals additionally check clipping, overlaps, broken layout, unreadable labels, viewBox/cropping, scaling, and the semantic relationships in the rendered image. Escalate beyond this basic private founder-review record only for an explicitly requested or audience-required accessibility, distribution, or production obligation.
