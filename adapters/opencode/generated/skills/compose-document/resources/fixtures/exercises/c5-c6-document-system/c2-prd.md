# C2 PRD Exercise: Retry-Policy Direction Validation

- **Adapter:** `prd.md`
- **Pinned snapshot:** `notification-retry-policy/SNAP-005`
- **Reader:** RFC planner
- **Reader action:** Keep a current retry count out of the RFC; do not create an implementation plan, schedule, owner assignment, or replacement configuration from this exercise.
- **Primary shaping fit:** `review-briefing`; the reader is reviewing a known decision boundary, not learning the domain from scratch.

## Problem And Intended Outcome

The RFC needs an author-approved retry-policy direction. The current evidence does not identify a retry count that meets both the required delivery rate and dead-letter latency target under the validated migration conditions.

The intended outcome is a safe RFC boundary: no current retry count is stated until a configuration is validated against both targets and a new author-approved decision exists.

## Current Requirement Boundary

`DEC-003`, approved by `APR-004`, directs the RFC not to state a count pending validation. `OBS-004` supplies current evidence: four retries missed delivery, while five met delivery but exceeded latency. The rerun invalidated prior report support; it did not itself approve policy.

## Out Of Scope And Blocking Gap

The Case does not provide workload variables, numeric thresholds, a replacement configuration, an implementation owner, a delivery schedule, rollout authorization, or a success metric beyond the named delivery and latency targets. `GAP-002` remains open. Those omissions block a count-bearing implementation requirement rather than creating one by implication.

## Selection And Omission

| Entry | Role | Handling |
|---|---|---|
| `OBS-004` | Current evidence | Selected: establishes the current evidence boundary only. |
| `DEC-003` | Accepted direction | Selected: establishes the no-count RFC requirement. |
| `GAP-002` | Blocking gap | Selected: prevents a replacement requirement. |
| `DEC-002` and `OBS-003` | Stale baseline context | Selected: distinguish a frozen prior report from current reader action. |
| `ALT-001` and `OBS-002` | Competing weak claims | Omitted from the core requirement; disclosed in C3/C6 to prevent their treatment as current policy. |

## Trace Basis

The C2 claims are supported by `notification-retry-policy/SNAP-005/OBS-004`, `notification-retry-policy/SNAP-005/DEC-003`, `notification-retry-policy/SNAP-005/GAP-002`, `notification-retry-policy/SNAP-005/DEC-002`, and `notification-retry-policy/SNAP-005/OBS-003`. This exercise creates no accepted product requirement.
