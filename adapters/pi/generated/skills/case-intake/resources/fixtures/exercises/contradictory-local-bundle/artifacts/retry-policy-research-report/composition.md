# Research Report Composition

## Reader Contract

An RFC reviewer needs a compact evidence basis to decide whether the notification RFC may state a current migration retry policy. The report is allowed to recommend only the author-approved direction in the pinned snapshot and must show why five retries is not current policy.

## Draft Basis

- Recommend four retries for the validated migration conditions.
- Explain that capacity validation found three retries insufficient and five retries beyond the dead-letter latency target.
- Separate that observation from the author-approved decision to use four retries.
- Retain the historical three-retry policy and rejected five-retry proposal as context, not alternatives to adopt.
- State that the result does not generalize beyond the tested migration conditions.

## Composition Boundary

No new meaning is proposed. The composition does not determine whether a later validation applies to another workload, and it does not treat the channel claim as authority.
