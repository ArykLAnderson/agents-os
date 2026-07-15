# Target Locator Translation

The integrated `successor-r2` trace remains the source of semantic support. This file translates its locators for each formatted target; it does not create a second trace or claim final Notion locators.

| Trace unit | Source locator | Portable Markdown locator | Notion-native source locator | HTML companion locator |
|---|---|---|---|---|
| `AU-101` | `#recommendation` | Heading: `## Recommendation` | Heading: `Current direction` callout | `#recommendation` |
| `AU-102` | `#evidence-and-authority-register` | Heading: `## Evidence And Authority Register` | Heading: `## Evidence and authority register` | `#authority` |
| `AU-103` | `#evidence` | Heading: `## Evidence` | Heading: `## Evidence` | `#evidence` |
| `AU-104` | `#limitations` | Heading: `## Limitations` | Heading: `## Limitations` | `#limitations` |
| `AU-105` | `#decision-boundary` | Heading: `## Decision Boundary` | Heading: `## Decision boundary` | `#boundary` |
| `AU-106` | `selection-manifest.md#omitted-and-deferred-entries` | Authority-register paragraph and `ALT-001`/`OBS-002` row | Authority-register paragraph and `ALT-001`/`OBS-002` row | Authority framing, table row, and text equivalent |

Portable Markdown uses visible heading text rather than non-standard heading attributes or processor-specific slug guesses. The Notion-native source names intended blocks, but final Notion block locators require an authorized publication followed by fetch-back.
