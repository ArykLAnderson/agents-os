### OBS-001: Historical three-retry policy

- **Statement:** The superseded policy retried failed notification delivery three times before dead-lettering.
- **Status:** historical
- **Provenance:** source-direct
- **Sources:** SRC-001 / Decision

### ALT-001: Five-retry proposal

- **Statement:** A partially attributed planning participant proposed five retries for transient migration failures.
- **Status:** rejected
- **Provenance:** source-direct
- **Sources:** SRC-002 / 00:08:10-00:08:34
- **Confidence:** medium
- **Relations:** contradicts OBS-003

### OBS-003: Capacity validation limit

- **Statement:** Capacity validation found that three retries missed the required delivery rate, four retries sustained it, and five retries exceeded the dead-letter latency target.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-004 / full result
- **Relations:** contradicts DEC-001; contradicts ALT-001

### INT-001: Establish an RFC-ready retry-policy direction

- **Statement:** The notification RFC should state an author-approved retry-policy direction.
- **Status:** accepted
- **Provenance:** author-stated
- **Sources:** none: exercise purpose
- **Approval:** APR-001

### DEC-001: Retain three retries for the migration

- **Statement:** The current migration policy retries failed notification delivery three times before dead-lettering.
- **Status:** superseded
- **Provenance:** source-direct
- **Sources:** SRC-001 / Decision
- **Approval:** APR-001
- **Relations:** selects OBS-001; contradicts OBS-002; contradicts OBS-003

### DEC-002: Use four retries for the migration

- **Statement:** The current migration policy retries failed notification delivery four times before dead-lettering.
- **Status:** accepted
- **Provenance:** source-direct
- **Sources:** SRC-004 / full result
- **Approval:** APR-002
- **Relations:** supersedes DEC-001; selects OBS-003

### GAP-001: Current retry-policy authority is resolved

- **Statement:** The author resolved the retry-policy authority after reviewing capacity validation.
- **Status:** resolved
- **Provenance:** author-stated
- **Sources:** none: author response at author-response-reconciliation.md#capacity-policy-correction
- **Approval:** APR-002
- **Relations:** derived-from DEC-001, OBS-003; resolves DEC-002
