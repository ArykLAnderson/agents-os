---
name: resolving-merge-conflicts
description: Resolve an ordinary in-progress git merge or rebase by recovering both intentions, preserving contracts, and completing the operation.
---

# Resolving Merge Conflicts

Resolve intentions, not merely conflict markers.

1. Inspect the merge/rebase state, history, conflicting files, tests, linked tickets, and PR context.
2. Recover the existing intention, incoming intention, and integration objective.
3. Classify each conflict as textual, additive, semantic, structural, architectural, or domain-level.
4. Resolve textual, additive, and documented semantic conflicts directly. Preserve both intentions where compatible; otherwise follow the established specification or integration objective. Do not invent unrelated behavior.
5. Use `domain-modeling` for incompatible concepts and `codebase-design` for seam or contract questions.
6. Run project checks, stage the resolutions, and continue until the merge or rebase completes.

## Architectural stop condition

Do not bury a redesign inside lightweight conflict resolution. If a correct result requires crossing a module boundary, breaking a contract, duplicating domain rules, or substantial refactoring, invoke `zoom-out` and return a conflict brief to the caller containing:

- the intentions being reconciled;
- the blocking contract or seam;
- why a local merge would be architecturally wrong;
- the proposed reconciliation level;
- affected specification and ticket criteria;
- the reproducible merge state.

When called by `feature-integration`, return control to that coordinator for a dedicated refactor cycle. For a standalone merge with no coordinator, surface the brief to the human. Do not abort merely because the conflict is difficult.
