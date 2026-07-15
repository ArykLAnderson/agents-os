---
name: shape-document
description: Rewrite composed material into a reader journey using selected shaping strategy resources while preserving accepted Case meaning. Use after composition and before tracing.
user-invocable: true
argument-hint: "[composition artifact] [strategy]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Shape Document

Turn composed material into a readable artifact for a specific audience and action.

Shaping rewrites the draft directly. It may reorder, compress, expand, split, consolidate, tabulate, visualize, move material to appendices, and remove low-value prose only when meaning, authority, confidence, scope, and reader action remain faithful to the pinned Case snapshots.

## Contract

- Load one primary strategy and at most one bounded secondary strategy from `resources/strategies/`.
- Treat audience, reader action, density, disclosure, evidence visibility, visual weight, risk visibility, and length as parameters.
- Preserve accepted Case meaning and explicit uncertainty.
- Create stable visible or hidden semantic anchors for downstream tracing.
- Account for selected entries that are omitted or deferred from the reader-facing artifact.
- Send unsupported discoveries, material caveat changes, or proposed accepted meaning to `case-reconcile`.

## Boundary

- Do not create new accepted Case meaning.
- Do not trace, review, format, publish, or reconcile on your own.
- Do not hide critical decisions, risks, caveats, or review asks behind progressive disclosure.
- Stop rather than inventing a bespoke strategy when no selected strategy fits honestly.

## Progressive Resources

Load only selected strategy files under `resources/strategies/`.

Initial strategy skeletons:

- `decision-brief.md`
- `evidence-synthesis.md`
- `review-briefing.md`
- `mental-model.md`
