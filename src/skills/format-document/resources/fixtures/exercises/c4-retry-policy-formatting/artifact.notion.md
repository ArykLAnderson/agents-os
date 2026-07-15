# Notification Migration Retry Policy: Current Evidence Synthesis

> **Current direction:** Do not state a retry count in the RFC until a configuration is validated to meet both the required delivery rate and the dead-letter latency target.

## Evidence and authority register

The controlled rerun is evidence, not policy authority. `ALT-001` is a rejected five-retry proposal, and the duplicate unattributed channel claim `OBS-002` is omitted from prose because it repeats that proposal; its weak authority remains disclosed here. Neither claim is current policy.

| Item | Status | Establishes | Does not establish |
|---|---|---|---|
| Original capacity validation (`OBS-003`) | Superseded observation | Evidence used by the frozen baseline report. | Current capacity support after the conflicting rerun. |
| Controlled capacity rerun (`OBS-004`) | Current observation | Four retries missed delivery; five retries exceeded the latency target. It invalidates baseline report support for four retries. | Why the runs differ, any numeric margin, a replacement configuration, or policy authority. |
| Four-retry decision (`DEC-002`) | Superseded decision | The formerly approved policy direction. | A current policy after `APR-004`; the rerun did not supersede it. |
| Author approval (`APR-004`) and no-count decision (`DEC-003`) | Accepted direction | Do not state a count pending validation that meets both targets. | A replacement count or evidence that any configuration meets both targets. |
| Five-retry planning/channel claims (`ALT-001`, omitted `OBS-002`) | Rejected or weak authority | Competing claims exist. | Current policy or adequate capacity support. |

## Evidence

The controlled rerun found four retries below the required delivery rate. Five retries met delivery but exceeded the dead-letter latency target. The available evidence therefore supports no current retry count.

The rerun invalidates report support for the four-retry recommendation. It did not itself supersede the author-approved four-retry decision. `APR-004` approved `DEC-003`, which changed the decision to the current no-count direction.

## Limitations

The record lacks workload mix, traffic volume, timing, environment configuration, implementation version, measurement method, and numeric thresholds. It cannot explain the result difference, quantify a margin, generalize beyond the stated migration conditions, or identify a replacement configuration.

## Decision boundary

Validate a configuration against both required targets, reconcile the evidence, and obtain a new author-approved decision before stating a retry count.

## Trace

The formatted content preserves the visible units in the integrated `successor-r2/artifact.trace.md`: `AU-101` recommendation, `AU-102` authority distinction, `AU-103` evidence result, `AU-104` limitations, and `AU-105` validation boundary. `AU-106` remains visible omission accounting for `OBS-002` and `ALT-001`, not a current-policy claim. See `trace-locators.md` for target locator translations; actual Notion block locators can only be recorded after an authorized publish and fetch-back.
