# Artifact Trace

- **Artifact:** `artifacts/retry-policy-research-report/successor-r2/artifact.md`
- **Revision:** `successor-r2`
- **Pinned snapshot set:** `notification-retry-policy/SNAP-005`
- **Trace status:** reviewable with open validation gap

## Units

### AU-101: No-count recommendation

- **Locator:** `#recommendation`
- **Assertion:** Do not state a retry count until a configuration meets both targets and is validated.
- **Derivation:** direct
- **Support:** `notification-retry-policy/SNAP-005/DEC-003`; `notification-retry-policy/SNAP-005/GAP-002`
- **Visibility:** visible
- **Status:** supported
- **Notes:** `DEC-003` is the accepted direction with `APR-004`; `GAP-002` explains why no count is currently usable.

### AU-102: Evidence and authority distinction

- **Locator:** `#evidence-and-authority-register`
- **Assertion:** `OBS-004` invalidates baseline report support, while `APR-004` separately supersedes `DEC-002` through `DEC-003`.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/OBS-003`; `notification-retry-policy/SNAP-005/OBS-004`; `notification-retry-policy/SNAP-005/DEC-002`; `notification-retry-policy/SNAP-005/DEC-003`
- **Visibility:** visible
- **Status:** supported
- **Notes:** The register prevents a source observation from being represented as policy authority.

### AU-103: Current evidence result

- **Locator:** `#evidence`
- **Assertion:** Four retries lack current delivery support and five retries exceeds the latency target; no count is supported by available evidence.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/OBS-004`; `notification-retry-policy/SNAP-005/GAP-002`
- **Visibility:** visible
- **Status:** supported
- **Notes:** The unit is limited to the stated rerun result and does not claim a numeric margin.

### AU-104: Comparability and threshold limitation

- **Locator:** `#limitations`
- **Assertion:** Missing run variables and numeric thresholds prevent explanation, quantification, generalization, and a replacement configuration.
- **Derivation:** direct
- **Support:** `notification-retry-policy/SNAP-005/OBS-004`; `notification-retry-policy/SNAP-005/GAP-002`
- **Visibility:** visible
- **Status:** limited
- **Notes:** The unrecorded variables and thresholds are documented in `post-baseline-capacity-rerun.md`; the trace does not infer their values.

### AU-105: Validation and approval boundary

- **Locator:** `#decision-boundary`
- **Assertion:** Validate, reconcile, and obtain a new author-approved decision before stating a count.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/DEC-003`; `notification-retry-policy/SNAP-005/GAP-002`; `notification-retry-policy/SNAP-005/INT-001`
- **Visibility:** visible
- **Status:** supported
- **Notes:** This is the bounded reader action, not a claim that validation has occurred.

### AU-106: Omitted weak channel claim

- **Locator:** `selection-manifest.md#omitted-and-deferred-entries`
- **Assertion:** The duplicate unattributed channel claim is omitted from the main prose while its weak authority remains visible in the register.
- **Derivation:** omission
- **Support:** `notification-retry-policy/SNAP-005/OBS-002`; `notification-retry-policy/SNAP-005/ALT-001`
- **Visibility:** omitted
- **Status:** supported
- **Notes:** Omission does not change the no-count action.

## Accounting

| Selected entry | Handling | Trace unit | Reader-facing treatment |
|---|---|---|---|
| `OBS-001` | context | AU-102 | Historical status in register context |
| `ALT-001` | evidence | AU-102, AU-106 | Rejected competing claim and omission accounting |
| `OBS-003` | context | AU-102 | Superseded original evidence |
| `OBS-004` | evidence | AU-102, AU-103, AU-104 | Current result and limitation |
| `INT-001` | context | AU-105 | RFC decision purpose |
| `DEC-002` | context | AU-102 | Former decision distinguished from source evidence |
| `DEC-003` | decision | AU-101, AU-102, AU-105 | Current accepted direction |
| `GAP-002` | limitation | AU-101, AU-103, AU-104, AU-105 | Open validation gap |
| `GAP-001` | limitation | AU-102 | Earlier authority boundary |
| `OBS-002` | omitted | AU-106 | Accounted duplicate weak claim |
