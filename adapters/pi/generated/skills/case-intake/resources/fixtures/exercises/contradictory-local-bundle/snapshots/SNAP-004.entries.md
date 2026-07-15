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
- **Relations:** contradicts OBS-003; contradicts OBS-004

### OBS-003: Capacity validation limit

- **Statement:** Capacity validation found that three retries missed the required delivery rate, four retries sustained it, and five retries exceeded the dead-letter latency target.
- **Status:** superseded
- **Provenance:** source-direct
- **Sources:** SRC-004 / full result
- **Relations:** contradicted-by OBS-004

### OBS-004: Post-baseline capacity rerun limit

- **Statement:** The controlled post-baseline rerun found that four retries missed the required delivery rate under the same validated migration conditions; five retries met the delivery rate but still exceeded the dead-letter latency target.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-005 / full result
- **Relations:** contradicts OBS-003; contradicts DEC-002

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
- **Status:** superseded
- **Provenance:** source-direct
- **Sources:** SRC-004 / full result
- **Approval:** APR-002
- **Relations:** supersedes DEC-001; selects OBS-003; contradicts OBS-004

### DEC-003: Do not state a retry count pending validated configuration

- **Statement:** Do not state a current retry count in the notification RFC until a configuration is validated to meet both the required delivery rate and the dead-letter latency target.
- **Status:** accepted
- **Provenance:** author-stated
- **Sources:** none: author response at artifacts/retry-policy-research-report/reconciliation-proposal.md#author-resolution-for-the-worked-exercise
- **Approval:** APR-004
- **Relations:** supersedes DEC-002; selects OBS-004

### GAP-002: No validated retry count meets both targets

- **Statement:** The available capacity results do not identify a retry count that meets both the required delivery rate and the dead-letter latency target for the validated migration conditions.
- **Status:** open
- **Provenance:** agent-inferred
- **Sources:** SRC-005 / full result
- **Relations:** derived-from OBS-004; blocks DEC-002

### GAP-001: Current retry-policy authority is resolved

- **Statement:** The author resolved the retry-policy authority after reviewing capacity validation.
- **Status:** resolved
- **Provenance:** author-stated
- **Sources:** none: author response at author-response-reconciliation.md#capacity-policy-correction
- **Approval:** APR-002
- **Relations:** derived-from DEC-001, OBS-003; resolves DEC-002
