---
model_contract: case-model/v1
initiative_id: mixed-intake
working_state: active
current_snapshot: SNAP-001
---

# Sources

Registered separately in the source-registration fixture.

# Type Extensions

No extensions.

# Entries

### OBS-001: Registration evidence

- **Statement:** Current author notes say source registration precedes semantic extraction.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-001 / author conversation notes
- **Relations:** supports INT-001

### INT-001: Inspectable intake provenance

- **Statement:** Case intake preserves inspectable provenance for supplied artifacts.
- **Status:** accepted
- **Provenance:** source-direct
- **Sources:** SRC-001 / author conversation notes
- **Approval:** APR-001

### DEC-001: Registration-first workflow

- **Statement:** Register every supplied artifact before extracting semantic entries.
- **Status:** accepted
- **Provenance:** agent-synthesized
- **Sources:** SRC-001 / author conversation notes; SRC-002 / 00:03:12-00:04:05
- **Approval:** APR-001
- **Relations:** resolves GAP-001

### GAP-001: Historical workflow conflict

- **Statement:** Historical workflow guidance conflicts with the registration-first proposal.
- **Status:** open
- **Provenance:** agent-inferred
- **Sources:** SRC-003 / historical workflow note
- **Confidence:** high
- **Relations:** derived-from DEC-001

# Snapshots

### SNAP-001: Initial Case approved

- **Created:** 2026-07-15
- **Reason:** intake-approved
- **Author status:** accepted
- **Approval:** APR-001
- **Entries:** manifest: snapshots/SNAP-001.entries.md (sha256:bf7e8bcbcdd80fa7ef5acef072244b71d2c51db6b00baa4af701da8948ac1006)
- **Supersedes:** none
- **Artifacts:** none
