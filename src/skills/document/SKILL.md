---
name: document
description: Develops and governs a persistent reader-facing semantic artifact from Case-backed or supplied evidence. Use when creating an RFC, PRD, report, brief, explanation, or publication, and when major editorial feedback, restructuring, compression, new claims, meaning-bearing visual specifications, appendices, or publication changes materially revise an artifact already in progress.
---

# Document

Produce an accepted durable semantic artifact from Case-backed meaning. Document owns editorial and semantic quality; it does not own rendered visual or interactive realization. Use ordinary model behavior for lightweight rewrites and disposable prose.

## Start Or Resume

Use an explicit user-provided Casebook workspace root when present; otherwise use `.casebook/` in the current project. Create or resume `documents/<document-id>/document.md` beneath it using [references/session.md](references/session.md). Establish intent, audience, reader action, genre, semantic artifact boundary, requested realization surfaces, publication boundary, and pinned Case states.

Document may perform bounded Case intake when supplied sources have clear purpose and interpretation. Enter Frame when meaning requires material discovery, interpretation, trade-offs, or human judgment; reconcile the Cases, then resume this session.

## Refine

Progress iteratively rather than treating these as mandatory one-pass phases:

1. [Compose](references/compose.md) a loose semantic basis using one genre adapter.
2. [Shape](references/shape.md) the reader journey using one primary strategy.
3. [Trace](references/trace.md) consequential semantic units to Case support.
4. [Review](references/review.md) with lenses selected from current risk.
5. [Format](references/format.md) one or more faithful semantic representations or realization handoffs.
6. [Publish](references/publish.md) only when publication is requested and separately authorized.

[Presentation](../presentation/SKILL.md) is a separate optional realization branch, not a Format or Publish phase. Invoke it when a rendered visual or interactive surface is part of the requested boundary; it may also begin directly from Cases, Frames, an existing surface, or a supplied brief.

Maintain one authoritative semantic draft. A target issue that changes meaning returns to that draft and invalidates affected semantic representations, realization handoffs, review conclusions, and acceptance. A purely visual or interactive issue belongs to Presentation.

## Govern Material Edits

Treat Document as the continuing editorial authority for the artifact, not a one-time generation step. When the user requests a material edit during review or after publication, resume the same Document session before editing the target representation.

A material edit changes meaning, reader action, claim strength, scope, semantic structure, evidence, risk treatment, visual semantics, appendix boundaries, or publication state. Apply the edit to the authoritative semantic draft, record the resulting invalidation, rerun the affected Shape, Trace, Review, and Format work, and refresh any Presentation handoff. Presentation owns rendered inspection and visual implementation; only meaning-changing pressure returns here. Small copyedits that preserve all of those may remain ordinary model behavior.

The material-edit loop completes when the semantic draft and every affected semantic representation or handoff agree, stale review or trace conclusions have been refreshed, linked Presentation work identifies the same source revision when present, publication state reflects the observed target, and the user can review one current revision rather than a series of ungoverned target edits.

Continue independent work when knowledge gaps do not block it. Record consolidated missing, ambiguous, unsupported, or conflicting Case knowledge and its effect as declarative state, then use Frame at the next natural boundary when new judgment or discovery is required.

Recommend completion when the requested artifact boundary is met, every applicable trace, review, representation, and publication obligation is complete or recorded as not applicable, and the current semantic draft remains suitable for the requested use. The human accepts the current revision conversationally. Publication is optional unless it was part of the request.

Creating a target file is not completion. Before reporting semantic completion, verify that material changes have not made review or trace stale, content accessibility and meaning-bearing visual specifications are current, realization handoffs identify their source revision, and the human accepts the current semantic revision. Presentation separately verifies rendered readiness when that surface is in scope; Document must not claim that proof itself. After the semantic conditions hold, persist `status: completed` and the accepted revision. A later material edit returns the Document to `active`; optional publication remaining pending does not reopen it unless publication belongs to the requested artifact boundary.
