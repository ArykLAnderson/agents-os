# Case Fidelity Lens

Run this lens with fresh context over the artifact, composition manifest, trace sidecar, and pinned snapshot manifests. It answers whether the reader-facing meaning is faithful, not whether the reviewer agrees with the decision.

## Checks

- Match each material assertion to its trace unit and fully qualified snapshot support.
- Verify that accepted decisions retain their approval and authority boundaries and that source evidence is not represented as policy authority.
- Verify that historical, rejected, superseded, disputed, and low-confidence entries are not presented as current accepted meaning.
- Verify that material contradictions, limitations, and selected omissions are visible or explicitly accounted for.
- Verify that a synthesis does not exceed the joint meaning, confidence, or scope of its support.
- Verify that an artifact pinned to superseded support is treated as stale when its reader action would mislead.

## Findings

For each finding, record severity (`blocker`, `material`, `minor`), artifact locator, trace unit, affected fully qualified entries, observed mismatch, and disposition. Unsupported assertions, authority/status conflicts, missing material caveats, misleading stale support, and untraced material tables or visuals are blockers. Name the smallest faithful remedy. Do not repair Case meaning; send semantic changes to `document-reconcile`.
