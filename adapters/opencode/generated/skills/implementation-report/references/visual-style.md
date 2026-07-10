# Visual Style

The report should feel authored for the project and milestone, not generated from a generic SaaS dashboard template.

## Choose an editorial direction

Pick one context-specific direction before writing CSS. Examples:

- technical field report
- annotated engineering dossier
- product launch review
- laboratory notebook
- architectural case study
- incident/postmortem-inspired audit
- magazine-style founder walkthrough

Use one strong visual idea consistently. Do not combine every possible effect.

## Reader hierarchy

The visual hierarchy should distinguish:

1. product outcome
2. observed evidence
3. implementation explanation
4. known limitation
5. future recommendation
6. source/evidence detail

Use typography, spacing, rules, and color before adding containers.

## Avoid report “dashboard disease”

Do not default to:

- a grid of rounded metric cards
- purple gradients
- glassmorphism
- a badge on every sentence
- excessive shadows and borders
- decorative architecture icons
- generic Inter/Roboto presentation styling
- one card per paragraph

A report is an editorial document, not an admin console.

## Typography

- Use a highly legible body face and a distinctive but readable display face.
- Keep line length around 55–80 characters for prose.
- Use monospace sparingly for evidence labels, code, and identifiers.
- Make headings visibly different in scale, rhythm, or family.
- Do not sacrifice mobile legibility for novelty.

System and locally available fonts are acceptable when portability matters. Avoid remote font dependencies in self-contained reports.

## Color

Use a restrained palette:

- dominant paper/background
- strong ink color
- one primary accent
- semantic colors for observed/pass, warning/unverified, and blocked/failure

Check normal-sized text against WCAG AA contrast. Do not communicate status by color alone.

## Layout

Desktop may use:

- sticky report index
- asymmetrical hero
- wide diagrams
- editorial side notes
- evidence ledgers

Mobile should:

- surface the title within the first viewport
- keep navigation usable without occupying the whole opening
- avoid page-level horizontal scrolling
- allow code and wide tables to scroll inside bounded containers
- stack screenshots in narrative order

## Screenshots

- Preserve the real UI; do not redraw it.
- Crop only to remove irrelevant device chrome or private data.
- Keep consistent framing across a sequence.
- Add captions outside the image rather than overlaying extensive text.
- Link to the full-resolution asset when useful.

## Diagrams

Let diagrams occupy enough width to remain readable. Use a quiet frame, clear caption, and text equivalent. Do not shrink a 1600-pixel architecture diagram into a narrow card column.

## Evidence presentation

Machine evidence should be readable without becoming the dominant aesthetic.

Use:

- concise result tables
- syntax-colored or high-contrast code blocks
- direct links to preserved artifacts
- short sanitized excerpts
- clear “what it proves / does not prove” columns

Avoid pasting full raw logs into the main narrative.

## Motion and scripts

Prefer no JavaScript. CSS-only interactions and native `<details>` elements are sufficient for most reports.

If motion is used, keep it subtle and respect `prefers-reduced-motion`. The report must remain complete when printed or scripts are disabled.

## Final taste checks

Ask:

- Could this report belong to any random project? If yes, make the visual concept more specific.
- Is the first page about the user result or about repository plumbing?
- Are there unnecessary boxes, labels, or metrics?
- Can the reader distinguish evidence from explanation and future work at a glance?
- Are the screenshots and diagrams legible at their actual rendered size?
- Does mobile feel designed rather than merely collapsed?
