# Presentation Evidence

- **Attempt:** `exercise-05-attempt-02`
- **Creation:** semantic artifact pass; exact HTML digest, screenshots, browser output, and inspection revision are recorded by the following evidence pass
- **Artifact:** `c6-explanation.html`
- **Inspection boundary:** local file only; no JavaScript is required for semantic acceptance and no external destination was contacted.

## Structural And Link Checks

- The HTML has one visible `h1`, ordered `h2` sections, `header`, `nav`, `main`, `section`, `figure`, `figcaption`, and `footer` landmarks.
- All six required visual anchors are present: `diagram-lifecycle`, `diagram-skill-hierarchy`, `diagram-trace`, `diagram-multi-case`, `diagram-safe-publishing`, and `diagram-proof-coverage`; their IDs match the C6 trace locators.
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

- **File URL:** `file:///Users/mont/agents-os-document-system-k1-exercise-05/src/skills/compose-document/resources/fixtures/exercises/c5-c6-document-system/c6-explanation.html`
- **Browser:** local Chromium launched by `agent-browser 0.31.1`; inspected on `2026-07-15`.
- **Desktop command:** `agent-browser --session ds05 open <file-url>`; `agent-browser --session ds05 set viewport 1440 1000`; `agent-browser --session ds05 screenshot rendered/c6-desktop-1440x1000.png`; `agent-browser --session ds05 eval <viewport/scroll/figure/equivalent/id check>`; `agent-browser --session ds05 errors`.
- **Desktop output:** viewport `1440x1000`; page scroll/client widths `1440/1440`; `overflow:false`; `figures:6`; `equivalents:6`; all six required diagram IDs `true`; no browser errors. Screenshot: `rendered/c6-desktop-1440x1000.png`.
- **Narrow command:** `agent-browser --session ds05 open <file-url>`; `agent-browser --session ds05 set viewport 390 844`; `agent-browser --session ds05 screenshot rendered/c6-narrow-390x844.png`; `agent-browser --session ds05 eval <viewport/scroll/figure/equivalent/flow-column check>`; `agent-browser --session ds05 errors`.
- **Narrow output:** viewport `390x844`; page scroll/client widths `390/390`; `overflow:false`; `figures:6`; `equivalents:6`; flow grid `324px` (one column); no browser errors. Screenshot: `rendered/c6-narrow-390x844.png`.
- **Rendering limit:** screenshots preserve the local QA state, not external accessibility conformance or real-reader approval. Browser commands are reproducible with the file URL and viewport sequence above.

## Full-Page Closure

- **Capture date:** `2026-07-15T08:44:12Z`.
- **Desktop command:** `agent-browser --session ds05 open <file-url>`; `agent-browser --session ds05 set viewport 1440 1000`; `agent-browser --session ds05 screenshot --full rendered/c6-full-desktop-1440x1000.png`; `agent-browser --session ds05 eval <figure/equivalent/id coverage check>`; `agent-browser --session ds05 errors`.
- **Desktop result:** `viewport:[1440,1000]`, `scroll:[1440,1440]`, `height:5467`, `overflow:false`, `figures:6`, `equivalents:6`; the full-page capture includes `diagram-lifecycle`, `diagram-skill-hierarchy`, `diagram-trace`, `diagram-multi-case`, `diagram-safe-publishing`, and `diagram-proof-coverage`, each followed by its adjacent text equivalent. Screenshot: `rendered/c6-full-desktop-1440x1000.png`; SHA-256 `1d6bb84b9349cbe5ce1ecaeb57ae740f1ab4032c0edcb815332a9ecab3dc58d4`.
- **Narrow command:** `agent-browser --session ds05 set viewport 390 844`; `agent-browser --session ds05 screenshot --full rendered/c6-full-narrow-390x844.png`; `agent-browser --session ds05 eval <figure/equivalent/id/flow-column coverage check>`; `agent-browser --session ds05 errors`.
- **Narrow result:** `viewport:[390,844]`, `scroll:[390,390]`, `height:8955`, `overflow:false`, `figures:6`, `equivalents:6`, `flowColumns:"324px"`; the same six diagram IDs and adjacent text equivalents are present in the full-page capture. Screenshot: `rendered/c6-full-narrow-390x844.png`; SHA-256 `1f80cd4fda4190be20a262a2c3291fa73005463d4f84dddca1ba39781346deb0`.

## Directional-Path Closure

- **Capture date:** `2026-07-15T08:48:20Z`.
- **HTML inspected:** SHA-256 `652b74bff1d106b23b038d08d9bd32a760836d526a5e50ff484ac79bb2ce03eb`.
- **Desktop command:** open the file URL; set viewport `1440 1000`; evaluate each `.path` for width, scroll width, flex direction, connector count, and step count; capture `--full`; inspect browser errors.
- **Desktop result:** each directional path is `display:flex` with `direction:"row"`, `width:1086`, and `scroll:1086`: lifecycle and skill hierarchy each have `5` adjacent steps and `4` connectors; safe publishing has `6` adjacent steps and `5` connectors. Page-level overflow is false. Screenshot: `rendered/c6-full-desktop-1440x1000.png`; SHA-256 `c650eda1221423a24c56c3c8f8519277368c3067d389c470e4e99ab5ec93f5f0`.
- **Narrow command:** set viewport `390 844`; evaluate the same path structure; capture `--full`; inspect browser errors.
- **Narrow result:** each directional path is `direction:"column"`, `width:324`, and `scroll:324`; lifecycle and skill hierarchy retain `5` steps and `4` connectors, while safe publishing retains `6` steps and `5` connectors. Page-level overflow is false. Screenshot: `rendered/c6-full-narrow-390x844.png`; SHA-256 `23f3d51906eb226e9cfde671093a9c7171c25b3884224b25c2722b97a7a543a1`.

## Reconciliation-Return Closure

- **Capture date:** `2026-07-15T08:51:30Z`.
- **HTML inspected:** SHA-256 `fd0e99274d3d7e14c36c21f4259509fab45e6b96bee5b0999cf40eb06224bccc`.
- **Desktop command:** open the file URL; set viewport `1440 1000`; evaluate `.return-band` text, flex direction, width, scroll width, and existence of `#skill-reconcile`; capture `--full`; inspect browser errors.
- **Desktop result:** one return band reads “Proposed meaning change returns from downstream work to the initial case-reconcile node, then a new snapshot and successor artifact”; it is a `row` at `1082/1082` scroll/client width, and `#skill-reconcile` exists. Page-level overflow is false. Screenshot: `rendered/c6-full-desktop-1440x1000.png`; SHA-256 `a57fbff69380f4b8b3e62ab5335895ddd8b66b76f29f1bb94ff72c871c077121`.
- **Narrow command:** set viewport `390 844`; evaluate the same return-band and destination-node checks; capture `--full`; inspect browser errors.
- **Narrow result:** the same one return band becomes a `column` at `320/320` scroll/client width, retains the explicit downstream-to-initial-reconciliation relationship, and `#skill-reconcile` exists. Page-level overflow is false. Screenshot: `rendered/c6-full-narrow-390x844.png`; SHA-256 `6b7ed9e30b0eb6ad7e1230bfa0d246c71b8ef68636fb1602a6741a5138d35419`.

## Accessibility And Reader Preservation

- Informative diagrams have role and alt text. Captions and adjacent text equivalents carry the reader-relevant meaning even if CSS diagrams do not render.
- Navigation uses native anchors. Critical conclusions, limitations, and the no-write boundary are visible selectable text and do not depend on hover, color, or progressive disclosure.
- CSS includes no script-driven semantics and no generated image that could imply unsupported relationships.
