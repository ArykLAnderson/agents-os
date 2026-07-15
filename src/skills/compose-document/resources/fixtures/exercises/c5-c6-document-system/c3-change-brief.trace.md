# Artifact Trace

- **Artifact:** `c3-change-brief.md`
- **Revision:** `25cb31347fe5407096db3f140a49f8ca4ae466d8`
- **Pinned snapshot set:** `notification-retry-policy/SNAP-005`
- **Trace status:** reviewable; review scope is bounded in the artifact header

## Units

### AU-301: Bounded review scope

- **Locator:** `#review-ask`
- **Assertion:** The review concerns the local current/stale entrypoint and evidence/authority representation, not a replacement count or delivery authorization.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/DEC-003`; `notification-retry-policy/SNAP-005/GAP-002`
- **Visibility:** visible
- **Status:** supported

### AU-302: Baseline support and decision changed separately

- **Locator:** `#what-changed`
- **Assertion:** `OBS-004` invalidated baseline report support, while `APR-004` approved `DEC-003` to supersede the four-retry direction.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/OBS-004`; `notification-retry-policy/SNAP-005/DEC-002`; `notification-retry-policy/SNAP-005/DEC-003`
- **Visibility:** visible
- **Status:** supported

### AU-303: Snapshot correction did not change policy meaning

- **Locator:** `#what-did-not-change`
- **Assertion:** `SNAP-005` is a representation correction and does not establish a margin, explanation, replacement configuration, or implementation authorization.
- **Derivation:** direct
- **Support:** `notification-retry-policy/SNAP-005/DEC-003`; `notification-retry-policy/SNAP-005/GAP-002`
- **Visibility:** visible
- **Status:** limited

### AU-304: Weak claims are not current policy

- **Locator:** `#evidence-and-risk`
- **Assertion:** `ALT-001` is rejected and duplicate unattributed `OBS-002` is omitted; neither is current policy.
- **Derivation:** synthesis
- **Support:** `notification-retry-policy/SNAP-005/ALT-001`; `notification-retry-policy/SNAP-005/OBS-002`; `notification-retry-policy/SNAP-005/DEC-003`
- **Visibility:** visible
- **Status:** supported

## Accounting

| Selected entry | Handling | Trace unit | Reader-facing treatment |
|---|---|---|---|
| `OBS-004` | evidence | AU-302 | Invalidates support, not authority. |
| `DEC-002` | stale context | AU-302 | Former four-retry direction. |
| `DEC-003` | decision | AU-301, AU-302, AU-303, AU-304 | Current no-count direction. |
| `GAP-002` | limitation | AU-301, AU-303 | Blocks a replacement count. |
| `ALT-001`, `OBS-002` | omission/context | AU-304 | Rejected or weak claims. |
