# Controlled Mutation And Staleness Inspection

## Control

The canonical `decision-brief.md`, `artifact.trace.md`, and SNAP-003 manifest were not changed. The mutations below describe a copied candidate `mutation-01` for inspection only.

## Mutations

| Mutation | Copied candidate change | Affected unit | Inspection result |
|---|---|---|---|
| Decision | `#accepted-policy` changed from four retries to five retries. | AU-001 | **Stale/blocking.** DEC-002 supports four, not five; the mutation also conflicts with OBS-003 and rejected ALT-001. |
| Row anchor | The Five row anchor changed from `option-five` to `option-later` without updating the trace. | AU-006 | **Stale/blocking.** Support remains semantically valid, but its row-level stable anchor is missing. Update the trace locator or restore the row anchor. |
| Material table cell | The Five row's outcome changed from "Exceeded the dead-letter latency target" to "Met the latency target". | AU-006 | **Stale/blocking.** The row makes a material assertion opposite to OBS-003. |

## Bounded Result

Only AU-001 and AU-006 are stale in `mutation-01`. AU-002 through AU-005 and AU-007 through AU-010 remain supported because their anchored claims and support references were unchanged. The copied candidate is not publication-ready because its supplied exercise action remains external context; it must still be corrected and retraced before its decision-record claims can be relied on.

## Re-Exercise

Restoring the original decision, `option-five` row anchor, and Five-row wording returns the copied candidate to the same content and unit support as candidate rev-03. The canonical decision record's trace status remains `current`; its supplied exercise action remains external context and it remains not publication-ready.
