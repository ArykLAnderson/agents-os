### OBS-001: Historical three-retry policy

- **Statement:** The superseded policy retried failed notification delivery three times before dead-lettering.
- **Status:** historical
- **Provenance:** source-direct
- **Sources:** SRC-001 / Decision

### ALT-001: Five-retry proposal

- **Statement:** A partially attributed planning participant proposed five retries for transient migration failures.
- **Status:** preferred
- **Provenance:** source-direct
- **Sources:** SRC-002 / 00:08:10-00:08:34
- **Confidence:** medium

### OBS-002: Unsupported current-policy claim

- **Statement:** An unattributed migration-channel message claimed that five retries are current policy.
- **Status:** disputed
- **Provenance:** source-direct
- **Sources:** SRC-003 / full message
- **Confidence:** low
- **Relations:** contradicts OBS-001

### GAP-001: Current retry-policy authority is unresolved

- **Statement:** The supplied sources do not identify an authority who accepted five retries or provide capacity evidence for that proposal.
- **Status:** open
- **Provenance:** agent-inferred
- **Sources:** SRC-002 / 00:08:10-00:12:16; SRC-003 / full message
- **Confidence:** high
- **Relations:** derived-from ALT-001, OBS-002

### INT-001: Establish an RFC-ready retry-policy direction

- **Statement:** The notification RFC should state an author-approved retry-policy direction.
- **Status:** accepted
- **Provenance:** author-stated
- **Sources:** none: exercise purpose
- **Approval:** APR-001

### DEC-001: Retain three retries for the migration

- **Statement:** The current migration policy retries failed notification delivery three times before dead-lettering.
- **Status:** accepted
- **Provenance:** author-approved
- **Sources:** SRC-001 / Decision; SRC-002 / 00:08:10-00:12:16
- **Approval:** APR-001
- **Relations:** selects OBS-001; contradicts OBS-002
