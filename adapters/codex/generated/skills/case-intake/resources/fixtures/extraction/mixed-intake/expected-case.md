---
model_contract: case-model/v1
initiative_id: mixed-intake
working_state: pending-author-approval
current_snapshot: none
---

# Sources

Registered separately in the source-registration fixture.

# Type Extensions

### EXT-001: `POL` policy obligation

- **Status:** proposed-core
- **Scope:** model-local fixture for externally issued policy obligations
- **Semantics:** A binding obligation issued by an external policy authority.
- **Why core types are insufficient:** `CON` records a boundary but does not preserve policy issuance and compliance lifecycle.
- **Owner:** Documentation policy working group
- **Introduced:** 2026-07-15
- **Example:** `POL-001: Case entries must retain source provenance.`
- **Promotion evidence:** Fixture-only; no multi-model evidence exists.

# Entries

### OBS-001: Registration precedes extraction

- **Statement:** Case intake registers supplied artifacts before semantic extraction.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-001 / author conversation notes
- **Relations:** supports INT-001

### OBS-002: Transcript registration requirement

- **Statement:** Speaker A said source registration must precede extraction for inspectable provenance.
- **Status:** current
- **Provenance:** source-quoted
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

### OBS-004: Secondary research limitation

- **Statement:** Transcript and research guidance require primary evidence expansion to remain bounded.
- **Status:** current
- **Provenance:** agent-synthesized
- **Sources:** SRC-002 / 00:03:12-00:04:05; SRC-007 / research summary
- **Confidence:** medium

### INT-001: Inspectable intake provenance

- **Statement:** Case intake preserves inspectable provenance for supplied artifacts.
- **Status:** accepted
- **Provenance:** author-stated
- **Sources:** SRC-001 / author conversation notes

### REQ-001: Preserve source provenance

- **Statement:** Case entries must retain their source provenance.
- **Status:** proposed
- **Provenance:** source-direct
- **Sources:** SRC-004 / description
- **Relations:** contradicts GAP-001

### OBS-005: Historical ticket normalization

- **Statement:** The prior RFC describes source registration after extraction.
- **Status:** historical
- **Provenance:** source-direct
- **Sources:** SRC-003 / proposal section
- **Relations:** contradicts GAP-001

### OBS-006: Parser behavior

- **Statement:** The supplied parser interface defines a `parseCaseModel` symbol.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-005 / parseCaseModel

### OBS-007: Review cycle-time result

- **Statement:** The supplied dashboard contains a review cycle-time panel for 2026-06-01 through 2026-07-01.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-006 / cycle-time panel

### INT-002: Reduce review burden

- **Statement:** The proposed intake workflow aims to reduce document review burden.
- **Status:** proposed
- **Provenance:** source-direct
- **Sources:** SRC-003 / claimed benefit

### ASM-001: Review burden benefit

- **Statement:** The proposed workflow reduces review burden, but the benefit has not been measured.
- **Status:** active
- **Provenance:** agent-inferred
- **Sources:** SRC-003 / claimed benefit
- **Confidence:** low
- **Relations:** supports INT-002

### GAP-001: Source ordering conflict

- **Statement:** The prior RFC and ticket disagree about whether registration precedes extraction.
- **Status:** open
- **Provenance:** agent-inferred
- **Sources:** SRC-003 / proposal section; SRC-004 / description
- **Confidence:** high
- **Relations:** contradicts OBS-005; contradicts REQ-001

### GAP-002: Inaccessible stakeholder input

- **Statement:** The unavailable stakeholder notes may contain material intake guidance that cannot be assessed.
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

### POL-001: Preserve source provenance

- **Statement:** Case entries must retain source provenance.
- **Status:** proposed
- **Provenance:** source-direct
- **Sources:** SRC-004 / description
- **Relations:** supports REQ-001

# Snapshots

No snapshot exists until the author approves the initial binding content.
