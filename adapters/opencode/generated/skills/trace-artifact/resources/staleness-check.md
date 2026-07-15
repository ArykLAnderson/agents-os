# Staleness Check

Check currency against the artifact's pinned snapshot set, not merely the current Case snapshot.

Inspect a trace whenever a later snapshot changes, supersedes, revokes, or materially qualifies its pinned support. For each traced unit, classify it as unchanged, stale, or review-needed. Mark a unit or artifact stale when later accepted meaning, an authority correction, revoked, superseded, or materially changed support, or a newly resolved blocking contradiction means the pinned support no longer satisfies the stated reader action. A later snapshot alone, unrelated changed entries, added context that does not change the traced assertion, or a presentation-only correction is not a staleness trigger.

For each stale result, record the trigger, affected entries, artifact units, pinned snapshot set, and required disposition. Preserve the original trace and snapshot binding; write a staleness notice or a new traced revision rather than silently repinning or mutating history. A revised artifact requires a new trace revision and a new review decision.
