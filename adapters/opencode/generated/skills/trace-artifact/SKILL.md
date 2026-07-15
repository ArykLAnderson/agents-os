---
name: trace-artifact
description: Produce artifact trace sidecars and publication blockers for shaped documents. Use after shaping and before review, formatting, or publishing decisions rely on artifact fidelity.
user-invocable: true
argument-hint: "[shaped artifact] [snapshot set]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Trace Artifact

Bind a shaped artifact revision to its immutable Case snapshot set.

Tracing records support for semantic units separately from reader-facing prose. It enables fidelity review, stale detection, visual/table coverage, target locator updates, and safe publication decisions.

## Contract

- Produce an `artifact.trace.md` sidecar for each formal artifact revision.
- Bind support to one immutable set of one or more Case snapshots.
- Use fully qualified support references: `<case-id>/<snapshot-id>/<entry-id>`.
- Trace semantic units rather than every sentence.
- Account for selected, intentionally omitted, and deferred Case entries.
- Identify unsupported material assertions, missing material anchors, stale support, status or authority conflicts, and untraced material visual or table assertions as blockers.
- Route semantic discoveries or unsupported new accepted meaning to `case-reconcile`.

## Publication Invariant

Publication cannot waive trace blockers. Any waiver or semantic change requires author-approved reconciliation into a new Case snapshot before publication can proceed.

## Boundary

- Do not edit the Case directly.
- Do not perform review, formatting, external publication, or target-specific locator writes beyond trace skeleton obligations.

## Progressive Resources

Load only the trace resources needed for the current check from `resources/`.
