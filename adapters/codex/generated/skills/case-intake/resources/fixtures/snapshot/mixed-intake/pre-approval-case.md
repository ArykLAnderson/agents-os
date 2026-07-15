---
model_contract: case-model/v1
initiative_id: mixed-intake
working_state: pending-author-approval
current_snapshot: none
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
- **Status:** proposed
- **Provenance:** source-direct
- **Sources:** SRC-001 / author conversation notes

### ALT-001: Registration-first workflow

- **Statement:** Register every supplied artifact before extracting semantic entries.
- **Status:** preferred
- **Provenance:** agent-synthesized
- **Sources:** SRC-001 / author conversation notes; SRC-002 / 00:03:12-00:04:05

### GAP-001: Historical workflow conflict

- **Statement:** Historical workflow guidance conflicts with the registration-first proposal.
- **Status:** open
- **Provenance:** agent-inferred
- **Sources:** SRC-003 / historical workflow note
- **Confidence:** high
- **Relations:** derived-from ALT-001

# Snapshots

No snapshot exists until the author approves the initial binding content.
