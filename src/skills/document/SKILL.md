---
name: document
description: Develops and governs a persistent reader-facing artifact from Case-backed or supplied evidence. Use when creating an RFC, PRD, report, brief, explanation, or publication, and when major editorial feedback, restructuring, compression, new claims, visuals, appendices, or publication changes materially revise an artifact already in progress.
---

# Document

Produce an accepted durable artifact from Case-backed meaning. Use ordinary model behavior for lightweight rewrites and disposable prose.

## Start Or Resume

Use an explicit user-provided Casebook workspace root when present; otherwise use `.casebook/` in the current project. Create or resume `documents/<document-id>/document.md` beneath it using [references/session.md](references/session.md). Establish intent, audience, reader action, genre, target representation, publication boundary, and pinned Case states.

Document may perform bounded Case intake when supplied sources have clear purpose and interpretation. Enter Frame when meaning requires material discovery, interpretation, trade-offs, or human judgment; reconcile the Cases, then resume this session.

## Refine

Progress iteratively rather than treating these as mandatory one-pass phases:

1. [Compose](references/compose.md) a loose semantic basis using one genre adapter.
2. [Shape](references/shape.md) the reader journey using one primary strategy.
3. [Trace](references/trace.md) consequential semantic units to Case support.
4. [Review](references/review.md) with lenses selected from current risk.
5. [Format](references/format.md) one or more faithful target representations.
6. [Publish](references/publish.md) only when publication is requested and authorized.

Maintain one authoritative semantic draft. A target issue that changes meaning returns to that draft and invalidates affected representations, review conclusions, and acceptance.

## Govern Material Edits

Treat Document as the continuing editorial authority for the artifact, not a one-time generation step. When the user requests a material edit during review or after publication, resume the same Document session before editing the target representation.

A material edit changes meaning, reader action, claim strength, scope, structure, evidence, risk treatment, visual semantics, appendix boundaries, or publication state. Apply the edit to the authoritative semantic draft, record the resulting invalidation, rerun the affected Shape, Trace, Review, Format, and Publish work, and inspect the updated representation in its real medium. Small copyedits that preserve all of those may remain ordinary model behavior.

The material-edit loop completes when the semantic draft and every affected representation agree, stale review or trace conclusions have been refreshed, publication state reflects the observed target, and the user can review one current revision rather than a series of ungoverned target edits.

Continue independent work when knowledge gaps do not block it. Record consolidated missing, ambiguous, unsupported, or conflicting Case knowledge and its effect as declarative state, then use Frame at the next natural boundary when new judgment or discovery is required.

Recommend completion when the requested artifact boundary is met, every applicable trace, review, representation, and publication obligation is complete or recorded as not applicable, and the current semantic draft remains suitable for the requested use. The human accepts the current revision conversationally. Publication is optional unless it was part of the request.

Creating a target file is not completion. Before reporting completion, verify that material changes have not made review or trace stale, inspect every requested representation in its rendered medium, record the current state, and obtain human acceptance. After those conditions hold, persist `status: completed` and the accepted revision. A later material edit returns the Document to `active`; optional publication remaining pending does not reopen it unless publication belongs to the requested artifact boundary.
