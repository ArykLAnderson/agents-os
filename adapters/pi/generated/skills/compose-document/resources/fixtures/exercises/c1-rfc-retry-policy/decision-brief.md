# Notification Migration Retry Policy

## Accepted Policy {#accepted-policy}

The accepted current policy is four retries for failed notification delivery during the current migration before the message is sent to the dead-letter queue. Policy authority was recorded in APR-002 and is represented by `notification-retry-policy/SNAP-003/DEC-002`.

## Scope {#scope}

This brief covers only migration retry behavior before dead-lettering. It does not establish a general notification policy, implementation schedule, or rollout owner.

## Capacity Evidence {#evidence-capacity}

Capacity validation reported that three retries did not sustain the required delivery rate, four retries did sustain it, and five retries exceeded the dead-letter processing latency target. The following comparison is limited to those reported migration outcomes.

| Retry count | Reported migration outcome | Decision status |
|---|---|---|
| <a id="option-three"></a>Three | Missed the required delivery rate | Superseded historical direction |
| <a id="option-four"></a>Four | Sustained the required delivery rate | Accepted direction |
| <a id="option-five"></a>Five | Exceeded the dead-letter latency target | Rejected proposal |

## Evidence Boundary {#evidence-boundary}

The Case records qualitative test conclusions only. It does not provide sample size, workload composition, test environment, measurement method, delivery-rate threshold, or latency value. This brief therefore does not claim performance magnitude, statistical confidence, or general behavior outside the migration.

## Trade-Off And History {#tradeoffs}

The former three-retry migration direction is retained only as superseded history. A five-retry proposal was rejected because the validation result exceeded the latency target. Neither alternative is current policy.

## Record Boundary {#record-boundary}

The retry-policy decision is already accepted; this is a decision record, not a request for a reader action. It may inform a separate implementation-planning discussion, but the Case does not identify an implementation owner, schedule, rollout plan, or authorization to begin implementation.

## Exercise Context {#exercise-context}

This local exercise asks a reviewer to inspect whether the record faithfully presents the accepted policy. That supplied exercise instruction is not Case authority, an approved reader action, or a publication instruction. Do not treat the record as policy approval, implementation authorization, owner assignment, schedule approval, or rollout approval.
