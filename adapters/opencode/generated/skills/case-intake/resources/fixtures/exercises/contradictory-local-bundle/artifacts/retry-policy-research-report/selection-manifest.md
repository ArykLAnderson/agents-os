# Research Report Composition Manifest

- **Adapter:** `compose-document/resources/adapters/research-report.md`
- **Case snapshot set:** `notification-retry-policy/SNAP-003`
- **Reader:** RFC reviewer
- **Reader action:** Decide whether the RFC may recommend the migration's current retry policy.
- **Composition result:** The report can recommend four retries, qualified to the validated migration conditions and with an explicit author-approval boundary.
- **Recommended shaping:** `evidence-synthesis`

## Selected Entries

| Entry | Handling | Role | Reader-facing treatment |
|---|---|---|---|
| `notification-retry-policy/SNAP-003/OBS-001` | context | Historical three-retry policy | Mentioned only to explain why prior policy is not current direction. |
| `notification-retry-policy/SNAP-003/ALT-001` | evidence | Partially attributed five-retry proposal | Included as a rejected competing proposal. |
| `notification-retry-policy/SNAP-003/OBS-003` | evidence | Capacity result | Included as decisive operational evidence and scope limit. |
| `notification-retry-policy/SNAP-003/INT-001` | context | RFC purpose | Included in the reader action. |
| `notification-retry-policy/SNAP-003/DEC-001` | context | Superseded accepted direction | Included as historical context; not a recommendation. |
| `notification-retry-policy/SNAP-003/DEC-002` | decision | Current accepted four-retry direction | Included as the policy recommendation. |
| `notification-retry-policy/SNAP-003/GAP-001` | limitation | Resolved authority question | Included to distinguish `APR-002` authority from source evidence. |

## Omitted And Deferred Entries

| Entry | Handling | Reason | Reader-action effect |
|---|---|---|---|
| `notification-retry-policy/SNAP-003/OBS-002` | omitted | The unattributed channel claim repeats the five-retry assertion already represented by `ALT-001`; its weak authority is disclosed in the limitation note. | No change. The report still makes clear that five retries are not current policy. |

## Gaps And Limits

- **Blocking gaps:** None for the scoped migration recommendation in `DEC-002`.
- **Deferrable gap:** The capacity result is a validated test result, not a statement that four retries apply outside the tested migration conditions.
- **Authority limit:** `SRC-004` establishes the retry-limit observation. `APR-002` establishes the current policy decision.
- **Reconciliation trigger:** Any evidence that four retries no longer meets the stated capacity result, or any attempt to broaden the recommendation beyond the tested migration, requires `case-reconcile`.
