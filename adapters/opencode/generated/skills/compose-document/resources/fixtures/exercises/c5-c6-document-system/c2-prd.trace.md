# Artifact Trace

- **Artifact:** `c2-prd.md`
- **Creation:** semantic artifact pass; exact artifact digest and inspected revision are recorded by the following evidence pass
- **Pinned snapshot set:** `notification-retry-policy/SNAP-005`
- **Trace status:** reviewable with the open `GAP-002` validation gap

## Units

### AU-201: No-count requirement boundary

- **Locator:** `#current-requirement-boundary`
- **Assertion:** The RFC must not state a retry count until a configuration meets both named targets and a new author-approved decision exists.
- **Derivation:** direct
- **Support:** `notification-retry-policy/SNAP-005/DEC-003`; `notification-retry-policy/SNAP-005/GAP-002`
- **Visibility:** visible
- **Status:** supported

### AU-202: Evidence is not authority

- **Locator:** `#current-requirement-boundary`
- **Assertion:** `OBS-004` provides current evidence about four and five retries but does not approve policy.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/OBS-004`; `notification-retry-policy/SNAP-005/DEC-003`
- **Visibility:** visible
- **Status:** supported

### AU-203: Count-bearing requirement is blocked

- **Locator:** `#out-of-scope-and-blocking-gap`
- **Assertion:** Missing thresholds, replacement configuration, owner, schedule, and rollout authorization prevent a count-bearing implementation requirement.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/GAP-002`; `notification-retry-policy/SNAP-005/DEC-003`
- **Visibility:** visible
- **Status:** limited
- **Notes:** Owner, schedule, and rollout are absence boundaries, not Case claims.

### AU-204: Weak competing claims are omitted from the core requirement

- **Locator:** `#selection-and-omission`
- **Assertion:** `ALT-001` and `OBS-002` are omitted from the core requirement but disclosed elsewhere so they cannot be read as current policy.
- **Derivation:** omission
- **Support:** `notification-retry-policy/SNAP-005/ALT-001`; `notification-retry-policy/SNAP-005/OBS-002`
- **Visibility:** visible
- **Status:** supported

## Accounting

| Selected entry | Handling | Trace unit | Reader-facing treatment |
|---|---|---|---|
| `OBS-004` | evidence | AU-202 | Current evidence only. |
| `DEC-003` | decision | AU-201, AU-202, AU-203 | Accepted no-count direction. |
| `GAP-002` | limitation | AU-201, AU-203 | Open validation boundary. |
| `DEC-002`, `OBS-003` | stale context | AU-203 | Baseline comparison only. |
| `ALT-001`, `OBS-002` | omission | AU-204 | Rejected or weak, never current policy. |
