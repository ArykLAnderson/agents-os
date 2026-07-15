# Notification Migration Retry Policy: Current Evidence Synthesis

## Recommendation

Do not state a current retry count in the RFC. The current author-approved direction is to wait for a configuration validated to meet both the required delivery rate and the dead-letter latency target.

## Evidence And Authority Register

The controlled rerun is evidence, not policy authority. `ALT-001` is a rejected five-retry proposal, and the duplicate unattributed channel claim `OBS-002` is omitted from prose because it repeats that proposal; its weak authority remains disclosed here. Neither claim is current policy.

| Item | Status | Establishes | Does not establish |
|---|---|---|---|
| Original capacity validation (`OBS-003`) | Superseded observation | The evidence used by the frozen baseline report. | Current capacity support after the conflicting rerun. |
| Controlled capacity rerun (`OBS-004`) | Current observation | Four retries missed delivery; five retries exceeded the latency target. It invalidates the baseline report's capacity support for four retries. | Why the runs differ, any numeric margin, a replacement configuration, or policy authority. |
| Four-retry decision (`DEC-002`) | Superseded decision | The formerly approved policy direction. | A current policy after `APR-004`. The rerun did not supersede it. |
| Author approval (`APR-004`) and no-count decision (`DEC-003`) | Accepted direction | Do not state a count pending validation that meets both targets. | A replacement count or evidence that any configuration meets both targets. |
| Five-retry planning/channel claims (`ALT-001`, omitted `OBS-002`) | Rejected or weak authority | Competing claims exist. | Current policy or adequate capacity support. |

## Evidence

The original validation supported the baseline four-retry report, but the controlled rerun is recorded as occurring under the same validated migration conditions and found four retries below the required delivery rate. Five retries met delivery but still exceeded the dead-letter latency target. The available evidence therefore supports no current retry count.

The rerun invalidates the report support for the four-retry recommendation. It did not itself supersede the author-approved four-retry decision. The decision changed only when `APR-004` approved `DEC-003`.

## Limitations

The record does not include the workload mix, traffic volume, timing, environment configuration, implementation version, or measurement method for either validation. It also does not include the numeric delivery-rate or latency thresholds. The evidence cannot explain the result difference, quantify a margin, generalize beyond the stated migration conditions, or identify a replacement configuration.

## Decision Boundary

Keep the retry count out of the RFC. Validate a configuration against both required targets, reconcile the resulting evidence, and obtain a new author-approved decision before stating a count.

## Trace

See [the target locator translation](trace-locators.md) and [the integrated successor trace](../../../../../case-intake/resources/fixtures/exercises/contradictory-local-bundle/artifacts/retry-policy-research-report/successor-r2/artifact.trace.md) for support and visibility of `AU-101` through `AU-106`.
