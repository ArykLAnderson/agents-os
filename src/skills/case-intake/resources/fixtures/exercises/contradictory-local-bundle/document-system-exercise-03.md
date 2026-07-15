# Document System K1 Exercise 03

- **Attempt:** `exercise-03-attempt-01`
- **Scope:** Local-only worked execution of `compose-document`, `shape-document`, `trace-artifact`, `review-document`, and `case-reconcile`.
- **Case:** `notification-retry-policy`
- **Baseline action:** Decide whether an evidence-heavy report may recommend the current migration retry policy.
- **Sources:** The existing Case's `SRC-001` through `SRC-004`; no discovery and no external actions.
- **Pinned baseline:** `notification-retry-policy/SNAP-003`

## Execution

1. Compose a research report from `SNAP-003` with the `research-report` adapter.
2. Shape it with `evidence-synthesis`, retaining the composition's selection and omission accounting.
3. Trace the shaped artifact, then run fidelity and genre review before editorial, presentation, and fresh-reader review.
4. Record burden and a local decision. The reader simulation is comprehension evidence only.
5. Reconcile one controlled post-baseline contradiction that changes the report's reader action; preserve the original baseline and produce a successor snapshot and proposal instead of mutating accepted history.
6. Re-exercise the original source/action against the successor snapshot to show the changed reader outcome.

The records in `artifacts/retry-policy-research-report/` are inspection evidence for this worked exercise. They are not a parser, deterministic semantic validator, external publication, or independent approval.
