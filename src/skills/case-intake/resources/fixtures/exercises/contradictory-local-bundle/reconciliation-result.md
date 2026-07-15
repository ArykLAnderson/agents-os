# Reconciliation Result

## Finding

### FIND-001: Later capacity evidence changes the retry-policy decision

- **Reports:** source-records.md#SRC-004
- **Materiality:** blocking
- **Authority:** none before author response
- **Evidence:** SRC-004 / full result
- **Affected entries:** DEC-001, ALT-001, GAP-001
- **Affected artifacts:** notification-rfc/artifact.md / AU-001
- **Disposition:** immediate interrupt; RFC reader-facing use halted

## Applied Outcome

- **Author outcome:** corrected and approved through APR-002
- **History:** DEC-001 remains inspectable with `superseded` status; DEC-002 adds the approved four-retry meaning and `supersedes DEC-001`.
- **Five-retry claim:** ALT-001 is rejected based on capacity evidence; the weak-authority channel claim never becomes a decision.
- **Snapshot:** SNAP-002 after immutable manifest creation
- **Staleness:** STALE-001 issued; no artifact snapshot set was mutated

## Representation Correction

### FIND-002: Accepted snapshot provenance and authority were conflated

- **Reports:** findings-and-reexercise.md#F-EX01-002
- **Materiality:** high
- **Authority:** none before author response
- **Evidence:** SNAP-002.entries.md; approvals/APR-001.md; approvals/APR-002.md
- **Affected entries:** DEC-001, DEC-002, GAP-001
- **Affected artifacts:** notification-rfc/artifact.md / AU-001 remains stale
- **Disposition:** retain SNAP-002 unchanged; request an explicit author correction before creating a successor snapshot

## Corrected Outcome

- **Author outcome:** APR-003 approved a corrected representation, not a change to the retry-policy decision.
- **History:** SNAP-002 and its manifest remain immutable historical evidence with digest `e672a0c94a81fe86b5f5be0f188f9f6d48add106b5a27209fe591729363c6d89`.
- **Correction:** SNAP-003 retains source-derived provenance and source locators for source-backed entries; `APR-001` and `APR-002` remain the authority records.
- **Snapshot:** SNAP-003 supersedes SNAP-002 after its manifest digest is recorded.
