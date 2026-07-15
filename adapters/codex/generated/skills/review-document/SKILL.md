---
name: review-document
description: Run staged document review lenses against Case-backed artifacts and consolidate findings without changing accepted meaning. Use after tracing and before formatting or publication decisions.
user-invocable: true
argument-hint: "[artifact and trace] [review scope]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Review Document

Review a Case-backed artifact through bounded, staged lenses.

The review system checks fidelity, genre fit, editorial quality, presentation quality, and fresh-reader comprehension. It consolidates findings by semantic issue and routes material changes through `case-reconcile`.

## Contract

- Load only the needed review lens resources from `resources/lenses/`.
- Run Case fidelity and genre review with fresh context when both are in scope.
- Run editorial and presentation review after semantic findings are known.
- Treat fresh-reader simulation as comprehension evidence, not real stakeholder approval.
- Consolidate duplicate findings and budget author-facing output.
- Apply automatic fixes only when meaning, authority, confidence, scope, evidence, reader action, and trace coverage remain unchanged.
- Send semantic changes, unsupported assertions, and material stakeholder questions to `case-reconcile`.

## Boundary

- Do not replace real product, technical, security, legal, privacy, operations, QA, or stakeholder approval.
- Do not waive trace or semantic blockers.
- Do not publish external targets.
- Do not run unrelated review councils or security review unless explicitly requested by a later ticket or user.

## Progressive Resources

Initial lens skeletons live under `resources/lenses/`.
