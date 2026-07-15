# Controlled Mutation And Staleness Inspection

## Control

The canonical `decision-brief.md`, `artifact.trace.md`, and SNAP-003 manifest were not changed. The mutations below describe a copied candidate `mutation-01` for inspection only.

## Mutations

| Mutation | Copied candidate change | Affected unit | Inspection result |
|---|---|---|---|
| Decision | `#decision` changed from four retries to five retries. | AU-001 | **Stale/blocking.** DEC-002 supports four, not five; the decision is also inconsistent with OBS-003 and rejected ALT-001. |
| Anchor | The Capacity Evidence heading ID changed from `evidence-capacity` to `capacity-results` without updating the trace. | AU-003 | **Stale/blocking.** Support remains semantically valid, but the required stable artifact anchor is missing. Update the trace locator or restore the anchor. |
| Material table cell | The Five row's outcome changed from "Exceeded the dead-letter latency target" to "Met the latency target". | AU-003 | **Stale/blocking.** The table makes a material assertion opposite to OBS-003. |

## Bounded Result

Only AU-001 and AU-003 are stale in `mutation-01`. AU-002, AU-004, AU-005, AU-006, and AU-007 remain supported because their anchored claims and support references were unchanged. The copied candidate must not be used for reader action until it is corrected and retraced.

## Re-Exercise

Restoring the original decision, `evidence-capacity` anchor, and Five-row wording returns the copied candidate to the same content and unit support as rev-01. The baseline candidate's trace status remains `current`.
