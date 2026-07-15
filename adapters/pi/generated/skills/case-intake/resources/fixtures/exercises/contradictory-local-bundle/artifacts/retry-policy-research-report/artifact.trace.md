# Artifact Trace

- **Artifact:** `artifacts/retry-policy-research-report/artifact.md`
- **Revision:** `baseline-r1`
- **Pinned snapshot set:** `notification-retry-policy/SNAP-003`
- **Trace status:** reviewable

## Units

### AU-001: Qualified four-retry recommendation

- **Locator:** `#recommendation`
- **Assertion:** The RFC may recommend four retries for the validated migration conditions as an author-approved direction.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-003/OBS-003`; `notification-retry-policy/SNAP-003/DEC-002`; `notification-retry-policy/SNAP-003/GAP-001`
- **Visibility:** visible
- **Status:** supported
- **Notes:** `OBS-003` supplies the capacity result; `DEC-002` and `APR-002` supply policy authority. Scope remains the validated migration conditions.

### AU-002: Evidence disposition table

- **Locator:** `#evidence`
- **Assertion:** Three retries are superseded, the five-retry proposal is rejected and non-authoritative, four retries is the current observed capacity result, and four retries is the accepted policy.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-003/OBS-001`; `notification-retry-policy/SNAP-003/ALT-001`; `notification-retry-policy/SNAP-003/OBS-003`; `notification-retry-policy/SNAP-003/DEC-001`; `notification-retry-policy/SNAP-003/DEC-002`
- **Visibility:** visible
- **Status:** supported
- **Notes:** The table distinguishes observation, status, and decision rather than treating the newest source as authority.

### AU-003: Scope and weak-authority limitation

- **Locator:** `#limitations`
- **Assertion:** Capacity evidence does not independently select policy or generalize beyond validated conditions; the unattributed five-retry channel claim is not authority.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-003/OBS-003`; `notification-retry-policy/SNAP-003/GAP-001`; `notification-retry-policy/SNAP-003/ALT-001`
- **Visibility:** visible
- **Status:** limited
- **Notes:** `OBS-002` is intentionally omitted from reader prose because the selection manifest records it as a duplicate weak claim; this unit preserves its authority limitation.

### AU-004: Reconciliation boundary

- **Locator:** `#decision-boundary`
- **Assertion:** A changed four-retry capacity result or broader RFC claim requires reconciliation before reader action.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-003/OBS-003`; `notification-retry-policy/SNAP-003/DEC-002`
- **Visibility:** visible
- **Status:** supported
- **Notes:** This is a bounded downstream action, not a new accepted Case decision.

### AU-005: Omitted disputed channel claim

- **Locator:** `selection-manifest.md#omitted-and-deferred-entries`
- **Assertion:** The disputed channel claim is not separately named in the table because it repeats the five-retry assertion; its weak-authority limit remains disclosed.
- **Derivation:** omission
- **Support:** `notification-retry-policy/SNAP-003/OBS-002`; `notification-retry-policy/SNAP-003/ALT-001`
- **Visibility:** omitted
- **Status:** supported
- **Notes:** Omission does not change the reader action.

## Accounting

| Selected entry | Handling | Trace unit | Reader-facing treatment |
|---|---|---|---|
| `OBS-001` | context | AU-002 | Historical row |
| `ALT-001` | evidence | AU-002, AU-003 | Rejected proposal row and limitation |
| `OBS-003` | evidence | AU-001, AU-002, AU-003, AU-004 | Recommendation, evidence, limitation, boundary |
| `INT-001` | context | AU-004 | RFC action boundary |
| `DEC-001` | context | AU-002 | Superseded row |
| `DEC-002` | decision | AU-001, AU-002, AU-004 | Accepted policy and boundary |
| `GAP-001` | limitation | AU-001, AU-003 | Authority distinction |
| `OBS-002` | omitted | AU-005 | Manifested duplicate weak claim |
