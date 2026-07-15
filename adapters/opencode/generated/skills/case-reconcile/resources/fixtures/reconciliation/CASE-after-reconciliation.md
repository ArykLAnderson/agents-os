---
model_contract: case-model/v1
initiative_id: reconciliation-fixture
working_state: active
current_snapshot: SNAP-002
---

# Entries

### OBS-001: intake source registration

- **Statement:** Register each supplied artifact before extracting semantic entries.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-001 / intake checklist

### OBS-002: prior registration guidance

- **Statement:** The original intake checklist only addressed accessible supplied artifacts.
- **Status:** historical
- **Provenance:** source-direct
- **Sources:** SRC-001 / intake checklist

### REQ-001: accessible artifact registration

- **Statement:** Register accessible supplied artifacts before extracting semantic entries.
- **Status:** superseded
- **Provenance:** author-approved
- **Sources:** none: author approval
- **Approval:** APR-001

### REQ-002: unavailable artifact registration

- **Statement:** Register accessible supplied artifacts and record unavailable artifacts as limited sources.
- **Status:** accepted
- **Provenance:** author-approved
- **Sources:** none: author correction
- **Approval:** APR-002
- **Relations:** supersedes REQ-001

### ALT-001: omit unavailable artifacts

- **Statement:** Omit inaccessible supplied artifacts from the Case entirely.
- **Status:** rejected
- **Provenance:** author-stated
- **Sources:** none: author discussion
- **Relations:** contradicts REQ-002

# Approvals

## Approval Event APR-001

- **Authority:** author
- **Author:** local-author
- **Recorded:** 2026-07-15T12:00:00Z
- **Locator:** queue/author-review.md#APR-001
- **Outcome:** approve
- **Approved entries:** REQ-001
- **Final wording:** Register accessible supplied artifacts before extracting semantic entries.

## Approval Event APR-002

- **Authority:** author
- **Author:** local-author
- **Recorded:** 2026-07-16T09:00:00Z
- **Locator:** queue/author-review.md#APR-002
- **Outcome:** approve
- **Approved entries:** REQ-002
- **Final wording:** Register accessible supplied artifacts and record unavailable artifacts as limited sources.

# Snapshots

### SNAP-001: Initial Case approved

- **Created:** 2026-07-15
- **Reason:** intake-approved
- **Author status:** accepted
- **Approval:** APR-001
- **Entries:** manifest: snapshots/SNAP-001.entries.md (sha256:15ea70777a1ecbc42f2f886cd410c333b9380529c16dd96bb1e54ad4499eea44)
- **Supersedes:** none
- **Artifacts:** none

### SNAP-002: Reconciliation approved

- **Created:** 2026-07-16
- **Reason:** reconciliation-approved
- **Author status:** accepted
- **Approval:** APR-002
- **Entries:** manifest: snapshots/SNAP-002.entries.md (sha256:d38fb12484c5d220022e4498836cccb99b7f2a7d97983bd4e0cb7a9e06ab6478)
- **Supersedes:** SNAP-001
- **Artifacts:** none
