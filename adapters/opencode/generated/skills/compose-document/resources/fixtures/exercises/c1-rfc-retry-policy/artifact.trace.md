# Artifact Trace

- **Artifact:** notification-retry-policy decision record, candidate rev-03
- **Snapshot set:** notification-retry-policy/SNAP-003
- **Case-backed reader action:** none; DEC-002 is already accepted
- **Supplied exercise action:** review whether this record faithfully presents DEC-002
- **Publication status:** not publication-ready; the supplied exercise action has no Case authority
- **Trace status:** current

## Units

### AU-001: Accepted policy

- **Anchor:** accepted-policy
- **Assertion:** Four retries is the accepted current policy for failed notification delivery during the migration.
- **Support:** notification-retry-policy/SNAP-003/DEC-002
- **Derivation:** direct
- **Status:** supported
- **Notes:** Approval is recorded separately in APR-002.

### AU-002: Scope boundary

- **Anchor:** scope
- **Assertion:** The decision applies to migration retry behavior before dead-lettering, not a general policy, schedule, or rollout ownership.
- **Support:** notification-retry-policy/SNAP-003/DEC-002; notification-retry-policy/SNAP-003/INT-001
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** The excluded schedule and owner are absence boundaries, not Case claims.

### AU-003: Capacity evidence boundary

- **Anchor:** evidence-capacity
- **Assertion:** Capacity validation reported the qualitative three-, four-, and five-retry outcomes shown in the comparison table.
- **Support:** notification-retry-policy/SNAP-003/OBS-003
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** The Case does not support a magnitude, confidence, or generalization claim.

### AU-004: Three-retry table row

- **Anchor:** option-three
- **Assertion:** Three retries missed the required delivery rate and are superseded historical direction.
- **Support:** notification-retry-policy/SNAP-003/OBS-003; notification-retry-policy/SNAP-003/DEC-001
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** The row carries both a reported capacity outcome and a status label.

### AU-005: Four-retry table row

- **Anchor:** option-four
- **Assertion:** Four retries sustained the required delivery rate and are the accepted direction.
- **Support:** notification-retry-policy/SNAP-003/OBS-003; notification-retry-policy/SNAP-003/DEC-002
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** Approval is recorded separately in APR-002.

### AU-006: Five-retry table row

- **Anchor:** option-five
- **Assertion:** Five retries exceeded the dead-letter latency target and remain a rejected proposal.
- **Support:** notification-retry-policy/SNAP-003/OBS-003; notification-retry-policy/SNAP-003/ALT-001
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** The row does not imply a general rejection outside this migration.

### AU-007: Evidence limits

- **Anchor:** evidence-boundary
- **Assertion:** The brief does not claim test magnitude, statistical confidence, or behavior beyond the migration because the Case records qualitative test conclusions only.
- **Support:** notification-retry-policy/SNAP-003/OBS-003
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** This is a disclosure of unavailable detail, not an assertion that testing was insufficient.

### AU-008: Historical alternatives

- **Anchor:** tradeoffs
- **Assertion:** The three-retry direction is superseded history and the five-retry proposal is rejected; neither is current policy.
- **Support:** notification-retry-policy/SNAP-003/DEC-001; notification-retry-policy/SNAP-003/ALT-001; notification-retry-policy/SNAP-003/DEC-002
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** Status labels remain visible to prevent historical material being read as current.

### AU-009: Decision-record boundary

- **Anchor:** record-boundary
- **Assertion:** The policy is already accepted; this record may inform later planning but does not authorize implementation, ownership, schedule, or rollout.
- **Support:** notification-retry-policy/SNAP-003/DEC-002; notification-retry-policy/SNAP-003/GAP-001; notification-retry-policy/SNAP-003/INT-001
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** APR-002 is an approval record at the Case root, not a snapshot entry.

### AU-010: Omitted duplicate historical observation

- **Anchor:** tradeoffs
- **Assertion:** OBS-001 is omitted because superseded DEC-001 carries the same reader-relevant three-retry history.
- **Support:** notification-retry-policy/SNAP-003/OBS-001; notification-retry-policy/SNAP-003/DEC-001
- **Derivation:** omission-accounting
- **Status:** supported
- **Notes:** The omission does not hide a current decision, risk, or caveat.
