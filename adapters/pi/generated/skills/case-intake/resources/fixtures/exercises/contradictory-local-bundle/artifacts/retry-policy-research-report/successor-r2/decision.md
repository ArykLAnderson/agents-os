# Successor Artifact Decision

- **Artifact revision:** `successor-r2`
- **Snapshot:** `notification-retry-policy/SNAP-004`
- **Decision:** This is the current safe reader-facing report revision for the RFC retry-count action.
- **Status:** Reviewable with open validation gap.
- **Reader action:** Do not state a retry count. Validate a configuration against both targets, reconcile the evidence, and obtain author approval before stating one.
- **Baseline handling:** `baseline-r1` remains frozen and stale. It is preserved for history and trace inspection, not current action.
- **Authority boundary:** `OBS-004` invalidates report support; `APR-004` approves the superseding decision `DEC-003`.
