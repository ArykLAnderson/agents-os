# Notification Migration Retry Policy: Evidence Synthesis

## Recommendation

The RFC may recommend **four retries before dead-lettering for the validated notification migration conditions**. This is an author-approved policy direction, not a policy inferred from the capacity test alone.

## Evidence

Capacity validation found that three retries missed the required delivery rate, four retries sustained it, and five retries exceeded the dead-letter latency target. The author then approved four retries as the current migration policy.

| Finding | Status | What it means for the RFC |
|---|---|---|
| Three retries were the historical policy. | Superseded | Do not present three retries as current direction. |
| A planning participant proposed five retries. | Rejected; partially attributed | Do not treat the proposal as authority or current policy. |
| Capacity validation sustained the delivery rate at four retries and found five retries beyond the latency target. | Current observed result | Supports four retries for the validated migration conditions. |
| The author approved four retries. | Accepted decision | The RFC may state four retries as the current migration direction. |

## Limitations

The capacity result establishes tested retry limits; it does not independently choose product policy. The recommendation is limited to the validated migration conditions. An unattributed channel message also claimed five retries were current policy, but it has no approval locator or capacity support and is not used as authority.

## Decision Boundary

Proceed with an RFC that states four retries for this migration and preserves the stated condition limit. Reconcile before reader action if later evidence changes the four-retry capacity result or if the RFC expands the claim beyond this migration.
