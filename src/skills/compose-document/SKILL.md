---
name: compose-document
description: Select Case entries from pinned snapshots through one document-genre adapter and produce a composition manifest. Use when turning approved Case snapshots into a draftable document basis.
user-invocable: true
argument-hint: "[case snapshot set] [genre]"
---

# Compose Document

Compose from pinned Case snapshots into a document-genre selection and draft basis.

Composition is adapter-driven. Load exactly the relevant genre adapter from `resources/adapters/` and keep the document bound to the immutable snapshot set that supplied it.

## Contract

- Require one or more pinned Case snapshots before composing.
- Load one composition adapter for the requested genre.
- Preserve Case identity in multi-Case compositions.
- Produce a selected-entry manifest and draftable composition, not a universal document AST.
- Identify blocking gaps, deferrable gaps, multi-Case conflicts, relevant omitted entries, and recommended shaping strategies.
- Route semantic discoveries or proposed new accepted meaning to `case-reconcile`.

## Boundary

- Do not invent unsupported facts, decisions, requirements, benefits, or caveats.
- Do not shape the reader journey beyond the adapter’s composition guidance.
- Do not trace, review, format, or publish the artifact.
- Do not load unrelated adapters.

## Progressive Resources

Load only the selected file under `resources/adapters/`.

Initial adapter skeletons:

- `rfc.md`
- `prd.md`
- `change-brief.md`
- `research-report.md`
- `implementation-report.md`
- `explanation-document.md`
