# Controlled Contradiction And Reconciliation Proposal

## New Local Evidence

### SRC-005: Post-baseline capacity rerun

- **Kind:** metric-set
- **Location:** `artifacts/retry-policy-research-report/post-baseline-capacity-rerun.md`
- **Reliability:** Local exercise evidence. It is a validated rerun result for the same migration conditions, but it does not independently select policy.

### OBS-004: Four retries no longer sustain delivery rate

- **Statement:** The controlled post-baseline rerun found that four retries missed the required delivery rate under the same validated migration conditions; five retries met the delivery rate but still exceeded the dead-letter latency target.
- **Status:** current
- **Provenance:** source-direct
- **Sources:** SRC-005 / full result
- **Relations:** contradicts OBS-003; contradicts DEC-002

## Classification

- **Finding:** `REC-EX03-001`
- **Materiality:** blocking
- **Affected baseline units:** AU-001, AU-002, AU-003, AU-004
- **Reason:** The reader-facing recommendation that four retries can be stated for the validated migration no longer satisfies the updated capacity evidence. Neither four nor five retries can be recommended from these results.
- **Immediate disposition:** Halt the baseline reader action. Do not repin `baseline-r1`; preserve its `SNAP-003` trace and mark it stale.

## Author Resolution For The Worked Exercise

`APR-004` supplies explicit local author approval to supersede `DEC-002` with `DEC-003`: do not state a current retry count in the RFC until a configuration that meets both delivery and latency targets is validated.

## Reconciliation Result

- Preserve `DEC-002` as superseded.
- Create accepted `DEC-003` with the no-count direction.
- Create successor `SNAP-004` and retain `SNAP-003` unchanged.
- Mark `baseline-r1` stale because its pinned support no longer satisfies its action.
- Produce a new report revision rather than modifying the frozen baseline.
