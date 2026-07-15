# Snapshot Integrity Reconciliation

## Finding: SNAP-004 Digest Mismatch

- **Finding:** `INTG-001`
- **Materiality:** high representation correction
- **Affected snapshot:** `SNAP-004`
- **Recorded digest:** `bb2d493d94a001ac27ea070b153f4386c2659088a575d5f6ef63cd8f77f06530`
- **Discovered actual digest:** `d90b2b995ec82beab89a3cd03473649814fa815e93eebe7aabdbb741cf461b1b`
- **Meaning assessment:** The current `SNAP-004` bytes represent the accepted `DEC-003` no-count direction and associated evidence state, but they no longer match the recorded digest. The mismatch is an immutable-snapshot integrity issue, not evidence that a new retry-policy decision was made.
- **Disposition before correction:** Preserve `SNAP-004` exactly as discovered. Do not rewrite it to match its old recorded digest or silently change its recorded history.

## Author-Approved Representation Correction

`APR-005` approves a successor snapshot that preserves the same accepted Case meaning with a verified digest. It does not approve a new policy, alter `DEC-003`, or resolve `GAP-002`.

## Result

- `SNAP-004` remains an inspectable historical integrity finding with its recorded and discovered digests.
- `SNAP-005` becomes the current representation-corrected snapshot.
- Current successor-report traces and review evidence bind to `SNAP-005`.
- `baseline-r1` remains frozen and stale on `SNAP-003`.
