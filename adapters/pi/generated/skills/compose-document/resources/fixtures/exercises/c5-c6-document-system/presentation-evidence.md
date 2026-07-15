# Presentation Evidence

- **Attempt:** `exercise-05-attempt-01`
- **Artifact:** `c6-explanation.html`
- **Inspection boundary:** local file only; no JavaScript is required for semantic acceptance and no external destination was contacted.

## Structural And Link Checks

- The HTML has one visible `h1`, ordered `h2` sections, `header`, `nav`, `main`, `section`, `figure`, `figcaption`, and `footer` landmarks.
- All six required visual anchors are present: `diagram-lifecycle`, `diagram-skill-hierarchy`, `diagram-trace`, `diagram-multi-case`, `diagram-safe-publishing`, and `diagram-proof-coverage`.
- Each figure has an adjacent selectable “Text equivalent” paragraph; each visual specification and the trace are linked locally from the footer.
- There are no external images, stylesheets, scripts, or attachments. This avoids a second provenance system and leaves all important meaning as ordinary text.
- Narrow-layout CSS switches flow and publish diagrams to one column and makes vocabulary tables horizontally scrollable without setting page-level fixed widths.

## Visual Semantics Review

| Visual | Trace | Allowed relationship checked | Explicit limitation retained |
|---|---|---|---|
| Lifecycle | AU-501, AU-502 | Snapshot pins local work; publication is separately gated | Not every artifact needs every stage. |
| Skill hierarchy | AU-503 | Meaning changes return to reconciliation | Return is not approval. |
| Trace | AU-504 | Evidence, authority, and gap are distinct lanes | Evidence does not approve policy. |
| Multi-Case | AU-505 | Separate snapshot/trace lanes join one manifest | Second Case lane is illustrative only. |
| Safe publishing | AU-506 | Authorization and destination stop the path before write | No check or write is claimed to occur. |
| Proof coverage | AU-507 | Case and local artifact checks cover different claims | Publishing and operational outcomes remain unverified. |

## Desktop And Narrow Review

- **Desktop observation:** local Chromium through `agent-browser` at `1440x1000`. The page scroll/client widths were `1440/1440`; there was no page-level horizontal overflow. All six figures, all six textual equivalents, and all six required diagram IDs were present. Screenshot: `/var/folders/hx/3xqbd8n145z41h_lsydyxycw0000gn/T/opencode/c6-desktop-1440x1000.png`.
- **Narrow observation:** local Chromium through `agent-browser` at `390x844`. The page scroll/client widths were `390/390`; `overflow` was `false`; all six figures and all six textual equivalents remained present. The flow diagram resolved to one `324px` column. Screenshot: `/var/folders/hx/3xqbd8n145z41h_lsydyxycw0000gn/T/opencode/c6-narrow.png`.
- **Browser errors:** `agent-browser errors` returned no page errors after each viewport inspection.
- **Rendering limit:** the screenshots are local temporary QA evidence and are intentionally not checked into the fixture. This records presentation behavior, not external accessibility conformance or real-reader approval.

## Accessibility And Reader Preservation

- Informative diagrams have role and alt text. Captions and adjacent text equivalents carry the reader-relevant meaning even if CSS diagrams do not render.
- Navigation uses native anchors. Critical conclusions, limitations, and the no-write boundary are visible selectable text and do not depend on hover, color, or progressive disclosure.
- CSS includes no script-driven semantics and no generated image that could imply unsupported relationships.
