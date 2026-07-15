# Post-Baseline Capacity Rerun

Controlled local exercise evidence captured after the `SNAP-003` report baseline.

- Under the same validated migration conditions, four retries missed the required delivery rate.
- Five retries met the delivery rate but exceeded the dead-letter latency target.
- This result establishes the observed limit only. It does not select retry policy.

## Comparability Limits

- The exercise records the rerun as occurring under the same validated migration conditions, but it does not record the workload mix, traffic volume, timing, environment configuration, implementation version, or measurement method for either run.
- The numeric delivery-rate and dead-letter-latency thresholds are not recorded in the supplied evidence.
- The result is therefore sufficient to invalidate the baseline artifact's claim that the available capacity evidence supports four retries under its stated conditions. It is not sufficient to explain why the results differ, quantify the margin, compare unrelated environments, or establish a replacement configuration.
