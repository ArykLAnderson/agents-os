# Notification Migration Retry Policy: Artifact Index

- **Normal reader entrypoint:** This file selects the report revision for the RFC reviewer action.
- **Current safe revision:** [`successor-r2/artifact.md`](successor-r2/artifact.md)
- **Current status:** `reviewable with open validation gap`
- **Pinned snapshot set:** `notification-retry-policy/SNAP-005`
- **Current reader action:** Do not state a retry count in the RFC until a configuration is validated to meet both the required delivery rate and dead-letter latency target.
- **Support and authority:** `OBS-004` identifies the unavailable count from current evidence; `APR-004` approves `DEC-003`, the no-count direction.

## Revision Status

| Revision | Snapshot | Status | Reader use |
|---|---|---|---|
| [`baseline-r1`](artifact.md) | `SNAP-003` | stale | Preserve as history; do not use for current reader action. `OBS-004` invalidated its capacity support, and `APR-004` later superseded its decision. |
| [`successor-r2`](successor-r2/artifact.md) | `SNAP-005` | reviewable with open validation gap | Use for the current RFC decision boundary. SNAP-005 is an author-approved representation correction with unchanged accepted meaning. |

The baseline is frozen. Its stale status is not a rewrite of its history or trace.
