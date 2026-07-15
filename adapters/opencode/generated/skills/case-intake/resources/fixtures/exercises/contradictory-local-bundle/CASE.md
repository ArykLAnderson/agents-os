---
model_contract: case-model/v1
initiative_id: notification-retry-policy
working_state: active
current_snapshot: SNAP-004
updated: 2026-07-18
---

# Sources

See `source-records.md`; it contains the complete intake and reconciliation source inventory.

# Type Extensions

No extensions.

# Entries

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

### OBS-002: Unsupported current-policy claim

- **Statement:** An unattributed migration-channel message claimed that five retries are current policy.
- **Status:** disputed
- **Provenance:** source-direct
- **Sources:** SRC-003 / full message
- **Confidence:** low
- **Relations:** contradicts OBS-001; contradicts OBS-003

### OBS-003: Capacity validation limit

- **Statement:** Capacity validation found that three retries missed the required delivery rate, four retries sustained it, and five retries exceeded the dead-letter latency target.
- **Status:** superseded
- **Provenance:** source-direct
- **Sources:** SRC-004 / full result
- **Relations:** contradicts DEC-001; contradicts ALT-001; contradicted-by OBS-004

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

### GAP-001: Current retry-policy authority is resolved

- **Statement:** The author resolved the retry-policy authority after reviewing capacity validation.
- **Status:** resolved
- **Provenance:** author-stated
- **Sources:** none: author response at author-response-reconciliation.md#capacity-policy-correction
- **Approval:** APR-002
- **Relations:** derived-from DEC-001, OBS-003; resolves DEC-002

### GAP-002: No validated retry count meets both targets

- **Statement:** The available capacity results do not identify a retry count that meets both the required delivery rate and the dead-letter latency target for the validated migration conditions.
- **Status:** open
- **Provenance:** agent-inferred
- **Sources:** SRC-005 / full result
- **Relations:** derived-from OBS-004; blocks DEC-002

# Approvals

See `approvals/APR-001.md`, `approvals/APR-002.md`, `approvals/APR-003.md`, and `approvals/APR-004.md`. Approval is recorded separately from source-derived provenance.

# Snapshots

### SNAP-001: Initial retry policy approved

- **Created:** 2026-07-15
- **Reason:** intake-approved
- **Author status:** accepted
- **Approval:** APR-001
- **Entries:** manifest: snapshots/SNAP-001.entries.md (sha256:00a501c58a4463d8104aa76b96e24ef018bb0b446efab43424180340d4f57ac4)
- **Supersedes:** none
- **Artifacts:** notification-rfc/artifact.md

### SNAP-002: Capacity-corrected retry policy approved

- **Created:** 2026-07-16
- **Reason:** reconciliation-approved
- **Author status:** accepted
- **Approval:** APR-002
- **Entries:** manifest: snapshots/SNAP-002.entries.md (sha256:9c3540efe11e8d478ed67a3b4ad6e7206fa584750e5f63ea7bc72d5e5ef14f75)
- **Supersedes:** SNAP-001
- **Artifacts:** notification-rfc/artifact.md marked stale

### SNAP-003: Provenance and authority representation corrected

- **Created:** 2026-07-17
- **Reason:** reconciliation-approved
- **Author status:** accepted
- **Approval:** APR-003
- **Entries:** manifest: snapshots/SNAP-003.entries.md (sha256:2ff51ce9b1e73595163254c5fe5011ca8ee6164a6182aa23f34c655235e59ec7)
- **Supersedes:** SNAP-002
- **Artifacts:** notification-rfc/artifact.md remains stale pending trace review

### SNAP-004: Retry-count direction withdrawn pending validation

- **Created:** 2026-07-18
- **Reason:** reconciliation-approved
- **Author status:** accepted
- **Approval:** APR-004
- **Entries:** manifest: snapshots/SNAP-004.entries.md (sha256:bb2d493d94a001ac27ea070b153f4386c2659088a575d5f6ef63cd8f77f06530)
- **Supersedes:** SNAP-003
- **Artifacts:** artifacts/retry-policy-research-report/artifact.md marked stale; successor outcome recorded in `artifacts/retry-policy-research-report/reexercise.md`
