# Notification Migration Retry Policy

## Decision {#decision}

Approve four retries for failed notification delivery during the current migration before the message is sent to the dead-letter queue. This is the accepted current direction in `notification-retry-policy/SNAP-003/DEC-002`.

## Scope {#scope}

This brief covers only migration retry behavior before dead-lettering. It does not establish a general notification policy, implementation schedule, or rollout owner.

## Capacity Evidence {#evidence-capacity}

Capacity validation found that three retries did not sustain the required delivery rate, four retries did sustain it, and five retries exceeded the dead-letter processing latency target. The following comparison is limited to those validated migration outcomes.

| Retry count | Validated migration outcome | Decision status |
|---|---|---|
| Three | Missed the required delivery rate | Superseded historical direction |
| Four | Sustained the required delivery rate | Accepted direction |
| Five | Exceeded the dead-letter latency target | Rejected proposal |

## Trade-Off And History {#tradeoffs}

The former three-retry migration direction is retained only as superseded history. A five-retry proposal was rejected because the validation result exceeded the latency target. Neither alternative is current policy.

## Authority And Caveat {#authority-caveat}

The retry-policy authority was resolved after review of the capacity validation and recorded in APR-002. The Case supports the direction, but it does not identify an implementation owner, schedule, or rollout plan.

## Requested Action {#requested-action}

Approve the four-retry migration direction and assign the implementation follow-up through the normal migration process. Do not treat this brief as approval of a rollout plan.
