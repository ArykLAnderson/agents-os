# Reconciliation Result

### FIND-003: contradictory binding registration scope

- **Reports:** REV-004, SRC-003
- **Materiality:** blocking
- **Evidence:** REQ-001; SRC-003 / policy section 2
- **Change:** The proposed every-linked-artifact rule contradicts the accepted accessible-supplied-artifact requirement.
- **Affected entries:** REQ-001, REQ-003, GAP-001
- **Relations:** REQ-001 contradicts REQ-003; GAP-001 derived-from REQ-001, REQ-003
- **Disposition:** immediate interrupt
- **Phase batch:** none
- **Snapshot:** unchanged
- **Downstream work:** halted
- **Authority:** none

### REQ-003: every linked artifact registration

- **Statement:** Register every linked artifact before extracting semantic entries.
- **Status:** proposed
- **Provenance:** source-direct
- **Sources:** SRC-003 / policy section 2
- **Relations:** contradicts REQ-001

### GAP-001: binding registration scope contradiction

- **Statement:** Resolve whether inaccessible linked artifacts are binding registration scope.
- **Status:** blocked
- **Provenance:** agent-synthesized
- **Sources:** REQ-001; REQ-003
- **Relations:** derived-from REQ-001, REQ-003

### FIND-006: missing authority for proposed constraint

- **Materiality:** blocking
- **Evidence:** SRC-004 / unattributed note
- **Disposition:** immediate interrupt
- **Downstream work:** halted

### FIND-007: unsupported current guidance

- **Materiality:** blocking
- **Evidence:** artifact.md#unsupported-claim
- **Disposition:** immediate interrupt
- **Downstream work:** halted

### FIND-008: stale material support

- **Materiality:** blocking
- **Evidence:** SRC-005 / superseded policy
- **Disposition:** immediate interrupt
- **Downstream work:** halted
