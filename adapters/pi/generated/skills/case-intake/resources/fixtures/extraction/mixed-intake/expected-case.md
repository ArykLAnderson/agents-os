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

### OBS-001: Registration precedes extraction

- **Statement:** Case intake registers supplied artifacts before semantic extraction.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-001 / author conversation notes
- **Relations:** supports INT-001

### OBS-002: Transcript registration requirement

- **Statement:** Source registration precedes extraction so provenance remains inspectable.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-002 / 00:03:12-00:04:05
- **Attribution:** Speaker A
- **Relations:** supports INT-001

### OBS-003: Unavailable source handling

- **Statement:** The planning transcript requires unavailable source references to avoid inferred content.
- **Status:** current
- **Provenance:** agent-inferred
- **Sources:** SRC-002 / 00:18:12-00:18:44
- **Confidence:** low
- **Relations:** supports GAP-002

### OBS-004: Bounded evidence handling

- **Statement:** Incomplete source evidence requires bounded handling rather than unsupported expansion.
- **Status:** current
- **Provenance:** agent-synthesized
- **Sources:** SRC-002 / 00:18:12-00:18:44; SRC-007 / research summary
- **Confidence:** medium

### INT-001: Inspectable intake provenance

- **Statement:** Case intake preserves inspectable provenance for supplied artifacts.
- **Status:** accepted
- **Provenance:** author-stated
- **Sources:** SRC-001 / author conversation notes

### OBS-005: Historical workflow ordering

- **Statement:** A historical workflow note recommends extracting entries before source registration.
- **Status:** historical
- **Provenance:** source-direct
- **Sources:** SRC-007 / historical workflow note
- **Relations:** contradicts OBS-001; contradicts OBS-002

### INT-002: Reduce review burden

- **Statement:** The proposed intake workflow aims to reduce document review burden.
- **Status:** proposed
- **Provenance:** source-direct
- **Sources:** SRC-007 / claimed benefit

### ASM-001: Review burden benefit

- **Statement:** The proposed workflow reduces review burden, but the benefit has not been measured.
- **Status:** active
- **Provenance:** agent-inferred
- **Sources:** SRC-007 / claimed benefit
- **Confidence:** low
- **Relations:** supports INT-002

### GAP-001: Source ordering conflict

- **Statement:** Accessible sources disagree about whether source registration precedes extraction.
- **Status:** open
- **Provenance:** agent-inferred
- **Sources:** SRC-001 / author conversation notes; SRC-007 / historical workflow note
- **Confidence:** high
- **Relations:** derived-from OBS-001; derived-from OBS-005

### GAP-002: Inaccessible stakeholder input

- **Statement:** Stakeholder guidance is unavailable for comparison with the accessible intake sources.
- **Status:** open
- **Provenance:** agent-inferred
- **Sources:** SRC-008 / unavailable metadata
- **Confidence:** high

### GAP-003: Transcript authority

- **Statement:** Speaker B authority to define current intake policy is unknown.
- **Status:** open
- **Provenance:** agent-inferred
- **Sources:** SRC-002 / 00:18:12-00:18:44
- **Confidence:** low

# Snapshots

No snapshot exists until the author approves the initial binding content.
