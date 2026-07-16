# Notion Native Adapter

Use this source representation to prepare content for a Notion-like block editor. It is not a publication request and it must not contain a destination default. Exact local rendering is not guaranteed; select remote staging when faithful review needs the real destination.

## Required Output

- Express title, section headings, paragraphs, lists, tables, links, and captions using portable Notion-readable Markdown or an equivalent explicit block plan.
- Put the current decision or recommendation, limitation, and required reader action in visible native text before any toggle, embed, or image. Those statements must remain searchable after import.
- Use progressive disclosure only for supporting detail. A disclosure boundary must not hide a current policy, risk, caveat, or action needed to interpret the artifact.
- Preserve child-content and existing-content safety as a publication precondition, not an assumption made by this formatting step.
- Give every visual an adjacent caption and textual equivalent. Do not rely on a generated visual to establish a semantic relationship.

## Local Evidence

Record the intended block choices, visible searchable text, visual alternatives, and any locator that a later publish step must capture. Do not claim that a Notion import, destination lookup, or rendered inspection occurred locally.

## Destination Semantics

**Representation conditions:** exact local rendering is unavailable, so destination-faithful review requires a remotely staged draft when the representation is consequential. Prefer native blocks, portable Markdown, semantic HTML, or supported attachments based on the content; use Mermaid only when the destination renders it faithfully, and otherwise retain an accessible image or textual equivalent.

The destination adapter may support a remotely staged draft followed by release. `document-publish(stage)` needs explicit staging authorization; release remains a separate authorization. Fetch remote edits before later update or release and return semantic conflicts to `document`.
