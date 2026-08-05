---
type: case-export
id: case:82326d36-09ca-43e1-830a-5ce159b3d2b8
revision: 1
revision_id: case-revision:995c81a3-14ed-52f1-a813-528c05816c00
state: active
namespace: namespace:personal
exported_at: 2026-08-05
---

# Document currently combines semantic and representation responsibilities

## Summary

The current Document workflow governs writing and evidence but also claims
broad representation, visual-semantic, rendered-inspection, and publication
responsibilities that may overlap a dedicated visual-surface workflow.

## Scope

The Agent OS Document skill as inspected on 2026-08-05. This Case informs, but
does not pre-decide, a future responsibility split.

## Knowledge

### K-001: Document currently combines semantic and representation responsibilities

- Knowledge ID: `knowledge:06fec2f1-1293-4c14-a28b-35d964f2a750`
- Classification: `provisional`
- Visibility: `private`
- Acting role: workflow analyst
- Inspected sources: `src/skills/document/SKILL.md`,
  `src/skills/document/references/format.md`, and
  `src/skills/document/references/session.md`

Document clearly owns an authoritative semantic draft, reader action, genre
and shape, Case traceability, review, and material editorial revisions.

It also currently owns:

- Target representations
- HTML responsiveness and accessibility
- Semantic diagrams
- Visual semantics and forbidden implications
- Real-medium inspection
- Publication state
- Completion across representations

This creates a prospective overlap when another workflow owns a website's
interactive and visual surface.

The user's current direction is that Document should sharpen writing and retain
structural or technical writing presentation, while a frontend design workflow
should own website visual fidelity.

The precise boundary remains unresolved because structure and hierarchy can
simultaneously carry semantic meaning and drive visual composition.

## Persistence Receipt

- Creation operation: `operation:a865f322-374d-43bc-918e-7e1d7320abf9`
- This export is not an update interface for the Case. Reconcile changes through
  the packaged `casebook` CLI, then refresh this snapshot.
