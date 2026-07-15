# Blind Fresh-Reader Scenario: Normal Entrypoint

- **Input available to simulated reader:** `INDEX.md` and the linked current report only. The baseline, Case ledger, trace, selection manifest, review records, and reconciliation proposal were not supplied unless linked by the normal entrypoint.
- **Persona:** RFC reviewer deciding whether a retry count can be stated.
- **Boundary:** A comprehension simulation, not stakeholder approval or operational validation.

## Scenario Result

| Required recovery | Simulated reader answer |
|---|---|
| Current artifact | `successor-r2/artifact.md`, selected by `INDEX.md`. |
| Current status | Reviewable with an open validation gap. |
| Pinned snapshot | `notification-retry-policy/SNAP-005`. |
| Current action | Do not state a retry count in the RFC. |
| Evidence support | `OBS-004` says four retries missed delivery and five retries exceeded latency; no available count meets both targets. |
| Authority | `APR-004` approved `DEC-003`, which withdraws the count pending validation. The rerun did not itself supersede policy. |
| Baseline status | `baseline-r1` is frozen and stale; it is not current reader guidance. |

## Result

The normal entrypoint enables recovery of the current artifact, status, snapshot, support, authority, and reader action without opening the Case records. No misunderstanding was observed in this bounded simulation.

The `SNAP-005` representation correction preserves the report meaning and reader action; it does not make the frozen stale baseline current.

- **Confidence limit:** Moderate. The simulation cannot demonstrate real reviewer comprehension, approval, or that a future validation will meet either unrecorded threshold.
