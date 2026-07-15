# Presentation Evidence

- **Attempt:** `exercise-04-attempt-01`
- **Inputs:** current `successor-r2` artifact and trace, pinned to `notification-retry-policy/SNAP-005`
- **Inspection mode:** local static file inspection; no external tool calls or publication

## Semantic Preservation

| Trace unit | Markdown | Notion-native source | HTML companion | Result |
|---|---|---|---|---|
| `AU-101` no-count recommendation | `#recommendation` | visible current-direction callout | `#recommendation` callout | Preserved as searchable visible text. |
| `AU-102` evidence and authority distinction | register | visible register and evidence paragraph | caption, register, and text equivalent | Preserved without presenting `OBS-004` as policy authority. |
| `AU-103` current evidence result | `#evidence` | `## Evidence` | `#evidence` | Preserved. |
| `AU-104` comparability and threshold limitation | `#limitations` | `## Limitations` | `#limitations` | Preserved. |
| `AU-105` validation and approval boundary | `#decision-boundary` | `## Decision boundary` | `#boundary` | Preserved. |
| `AU-106` omitted weak channel claim | trace link only | trace note | trace link only | Retained as trace accounting, not invented as reader-facing policy. |

## Assets And Links

- No image or attachment assets are used. This avoids an unsupported visual claim and leaves the authority distinction in native text.
- Markdown and HTML each link to the integrated `successor-r2/artifact.trace.md`; the relative target exists locally.
- HTML navigation targets `#recommendation`, `#authority`, `#evidence`, `#limitations`, and `#boundary`; each target exists exactly once.

## Layout And Navigation

- Normal inspection: the HTML uses a centered readable column, visible headings, a labeled navigation region, and a bordered register.
- Narrow inspection: the `40rem` media rule reduces page padding and stacks navigation. The register remains reachable within its labeled horizontal scroll container rather than clipping cells or hiding the conclusion.
- Keyboard inspection: navigation links are native anchors. The register wrapper has `tabindex="0"` so keyboard users can reach its horizontal overflow region.

## Accessibility And Searchability

- HTML declares `lang="en"`, uses `main`, `header`, `nav`, `section`, `footer`, a single `h1`, ordered `h2` headings, table headers, and a table caption.
- No image requires alternative text. The HTML register has a textual equivalent immediately after the table.
- The recommendation, no-current-count result, limitation, and validate/reconcile/approve action occur as ordinary text in all three outputs. Local text search finds each critical phrase.

## Findings And Re-Exercise

The first local draft of the Notion-native representation treated the evidence register as sufficient context but did not repeat the evidence-versus-authority distinction outside the table. The revised representation adds a visible evidence paragraph and explicit trace-unit note. The HTML companion also adds a table caption and text equivalent so the register is not the sole carrier of that distinction. No source artifact, Case snapshot, or trace was changed.
