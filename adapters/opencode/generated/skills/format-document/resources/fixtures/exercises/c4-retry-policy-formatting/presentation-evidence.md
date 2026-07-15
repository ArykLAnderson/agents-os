# Presentation Evidence

- **Attempt:** `exercise-04-attempt-01`
- **Inputs:** current `successor-r2` artifact and trace, pinned to `notification-retry-policy/SNAP-005`
- **Inspection mode:** local Chromium rendering through `agent-browser`; no external publication or external destination action

## Semantic Preservation

| Trace unit | Markdown | Notion-native source | HTML companion | Result |
|---|---|---|---|---|
| `AU-101` no-count recommendation | `## Recommendation` | current-direction callout | `#recommendation` | Preserved as searchable visible text. |
| `AU-102` evidence and authority distinction | `## Evidence And Authority Register` | `## Evidence and authority register` | `#authority` | Preserved without presenting `OBS-004` as policy authority. |
| `AU-103` current evidence result | `## Evidence` | `## Evidence` | `#evidence` | Preserved. |
| `AU-104` comparability and threshold limitation | `## Limitations` | `## Limitations` | `#limitations` | Preserved. |
| `AU-105` validation and approval boundary | `## Decision Boundary` | `## Decision boundary` | `#boundary` | Preserved. |
| `AU-106` omitted weak channel claim | authority-register paragraph and row | authority-register paragraph and row | authority framing, row, and text equivalent | `OBS-002` remains omitted from main prose but its duplicate and weak authority are visible with rejected `ALT-001`; neither becomes policy. |

## Assets And Links

- No image or attachment assets are used. This avoids an unsupported visual claim and leaves the authority distinction in native text.
- Markdown and HTML each link to the integrated `successor-r2/artifact.trace.md`; the relative target exists locally. `trace-locators.md` records the honest target translations.
- HTML navigation targets `#recommendation`, `#authority`, `#evidence`, `#limitations`, and `#boundary`; each target exists exactly once.

## Rendered Inspection

- **Artifact rendered:** `artifact.html` through local `file:///Users/mont/agents-os-document-system-k1-exercise-04/src/skills/format-document/resources/fixtures/exercises/c4-retry-policy-formatting/artifact.html`.
- **Desktop viewport:** Chromium at `1440x1000`; screenshot `rendered/desktop-1440x1000.png`. Direct observation: body width was `1440/1440` (scroll/client) and the register width was `1150/1150`, so no horizontal overflow occurred. The authority heading, framing paragraph, and scroll affordance were all in the viewport.
- **Narrow viewport:** Chromium at `390x844`; screenshot `rendered/mobile-390x844.png`. Direct observation: body width was `390/390`; the table wrapper was `768/356`, so the table is intentionally horizontally scrollable without causing page-level horizontal overflow. The authority heading, complete authority framing, and visible instruction to scroll horizontally were all in the viewport before the wrapper.
- The accessibility-tree snapshots at both viewports exposed the five navigation links, five table column headers, the `ALT-001`/`OBS-002` row, and the focusable labeled register.
- Keyboard inspection: navigation links are native anchors. The register wrapper has `tabindex="0"`, `aria-describedby="authority-table-help"`, and an explicit visible narrow-screen scroll instruction.

## Accessibility And Searchability

- HTML declares `lang="en"`, uses `main`, `header`, `nav`, `section`, `footer`, a single `h1`, ordered `h2` headings, table headers, a table caption, and an accessible scroll instruction.
- No image requires alternative text. The HTML register has a textual equivalent immediately after the table.
- The recommendation, no-current-count result, limitation, validate/reconcile/approve action, rejected `ALT-001`, and omitted weak-authority `OBS-002` accounting occur as ordinary text in all three outputs. This is a source-text and rendered accessibility-tree observation, not a claim that markup or JavaScript proves semantic support.

## Findings And Re-Exercise

The first local draft did not carry `ALT-001` and `OBS-002` omission accounting into the HTML register, used non-portable Markdown heading attributes as locators, and placed the narrow-table caption inside horizontal overflow without an advance affordance. The re-exercise adds the rejected/weak-authority row and framing in every target, translates trace locators honestly through `trace-locators.md`, and puts complete authority context plus a visible scroll instruction before the narrow table wrapper. No source artifact, Case snapshot, or trace was changed.
