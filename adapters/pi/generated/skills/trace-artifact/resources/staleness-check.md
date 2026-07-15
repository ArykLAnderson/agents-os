# Staleness Check

Inspect a trace whenever a later snapshot changes, supersedes, revokes, or materially qualifies its pinned support.

For each traced unit, compare its support to the later snapshot and classify it as unchanged, stale, or review-needed. Mark a unit stale when its supported entry is superseded, rejected, revoked, materially changed, or no longer supports the unit's reader action. Mark the artifact `stale` when a stale unit is material.

Do not mark an artifact stale merely because a newer Case snapshot exists. A later snapshot that changes unrelated entries, adds context without changing the traced assertion, or corrects presentation outside the unit is not a staleness trigger. Preserve the original trace and snapshot references; write a staleness notice or a new traced revision instead of mutating history.
