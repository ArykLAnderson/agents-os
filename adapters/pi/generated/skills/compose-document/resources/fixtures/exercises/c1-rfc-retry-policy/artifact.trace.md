# Artifact Trace

- **Artifact:** notification-retry-policy decision brief, candidate rev-01
- **Snapshot set:** notification-retry-policy/SNAP-003
- **Reader action:** approve the four-retry migration direction and request implementation follow-up
- **Trace status:** current

## Units

### AU-001: Accepted migration direction

- **Anchor:** decision
- **Assertion:** Four retries is the accepted current direction for failed notification delivery during the migration.
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

### AU-003: Capacity result and comparison table

- **Anchor:** evidence-capacity
- **Assertion:** Three retries missed delivery rate, four sustained it, and five exceeded the latency target; the table labels the corresponding current, superseded, and rejected positions.
- **Support:** notification-retry-policy/SNAP-003/OBS-003; notification-retry-policy/SNAP-003/DEC-002; notification-retry-policy/SNAP-003/DEC-001; notification-retry-policy/SNAP-003/ALT-001
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** The table is material and has no unsupported quantitative claims.

### AU-004: Historical alternatives

- **Anchor:** tradeoffs
- **Assertion:** The three-retry direction is superseded history and the five-retry proposal is rejected; neither is current policy.
- **Support:** notification-retry-policy/SNAP-003/DEC-001; notification-retry-policy/SNAP-003/ALT-001; notification-retry-policy/SNAP-003/DEC-002
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** Status labels remain visible to prevent historical material being read as current.

### AU-005: Authority and remaining caveat

- **Anchor:** authority-caveat
- **Assertion:** Authority for the retry direction was resolved through APR-002, while the Case does not specify owner, schedule, or rollout plan.
- **Support:** notification-retry-policy/SNAP-003/GAP-001; notification-retry-policy/SNAP-003/DEC-002
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** APR-002 is an approval record at the Case root, not a snapshot entry.

### AU-006: Requested action

- **Anchor:** requested-action
- **Assertion:** The approver is asked to approve the four-retry direction and assign later implementation follow-up, without approving a rollout plan.
- **Support:** notification-retry-policy/SNAP-003/INT-001; notification-retry-policy/SNAP-003/DEC-002
- **Derivation:** synthesis
- **Status:** supported
- **Notes:** Assignment is a requested next step, not an asserted Case commitment.

### AU-007: Omitted duplicate historical observation

- **Anchor:** tradeoffs
- **Assertion:** OBS-001 is omitted because superseded DEC-001 carries the same reader-relevant three-retry history.
- **Support:** notification-retry-policy/SNAP-003/OBS-001; notification-retry-policy/SNAP-003/DEC-001
- **Derivation:** omission-accounting
- **Status:** supported
- **Notes:** The omission does not hide a current decision, risk, or caveat.
