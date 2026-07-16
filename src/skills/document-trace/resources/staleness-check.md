# Staleness Check

Check currency against the artifact's pinned snapshot set, not merely the current Case snapshot.

For each stale result, record the trigger, affected entries, artifact units, pinned snapshot set, and required disposition. Preserve the original trace and snapshot binding; do not silently repin an existing artifact. A revised artifact requires a new trace revision and a new review decision. When an artifact has revisions, provide a reader-visible index that identifies the current safe revision, its status, snapshot set, and the stale baseline it replaces.

Inspect a trace whenever a later snapshot changes, supersedes, revokes, or materially qualifies its pinned support. For each traced unit, classify it as unchanged, stale, or review-needed. Mark a unit or artifact stale when later accepted meaning, an authority correction, revoked, superseded, or materially changed support, a new observation that invalidates or limits its support, or a newly resolved blocking contradiction means the pinned support no longer satisfies the stated reader action. Only an author-approved reconciliation supersedes accepted Case meaning. A later snapshot alone, unrelated changed entries, added context that does not change the traced assertion, or a presentation-only correction is not a staleness trigger.
